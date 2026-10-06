"""Test fixtures: a signing key, and stand-ins for delivery-mcp and the model endpoint.

Nothing here calls a real model. The stand-ins record what the agent sent them,
so the tests can check that the caller's token went out on every call.
"""

from __future__ import annotations

import base64
import json
import socket
import threading
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import httpx
import jwt
import pytest
import uvicorn
from cryptography.hazmat.primitives.asymmetric import rsa
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import CallToolResult, TextContent

from remediation_agent.app import create_app
from remediation_agent.config import load_settings

AUDIENCE = "agentgateway"
FAST_MODEL = "test-fast-model"
# All the time the agent under test gives one model call, retries included.
MODEL_TIMEOUT_SECONDS = 2.0


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve_in_thread(app: Any, port: int) -> uvicorn.Server:
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("server did not start")
        time.sleep(0.02)
    return server


# -- issuer -----------------------------------------------------------------


class Issuer:
    """A key generated for the test session, its JWKS, and tokens signed with it."""

    def __init__(self) -> None:
        self.port = free_port()
        self.issuer = f"http://127.0.0.1:{self.port}"
        self.jwks_url = f"{self.issuer}/jwks"
        self.kid = "test-key"
        self._key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def jwks(self) -> dict[str, Any]:
        numbers = self._key.public_key().public_numbers()

        def b64(n: int) -> str:
            raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
            return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

        return {
            "keys": [
                {"kty": "RSA", "use": "sig", "alg": "RS256", "kid": self.kid,
                 "n": b64(numbers.n), "e": b64(numbers.e)}
            ]
        }  # fmt: skip

    def mint(self, user: str = "platform-engineer", **overrides: Any) -> str:
        now = int(time.time())
        claims = {
            "iss": self.issuer,
            "aud": AUDIENCE,
            "sub": user,
            "iat": now,
            "exp": now + 300,
            "jti": uuid.uuid4().hex,
            "preferred_username": user,
            "roles": [user],
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, self._key, algorithm="RS256", headers={"kid": self.kid})


@pytest.fixture(scope="session")
def issuer() -> Iterator[Issuer]:
    issuer = Issuer()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            body = json.dumps(issuer.jwks()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", issuer.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield issuer
    server.shutdown()


# -- model endpoint ---------------------------------------------------------


@dataclass
class FakeModel:
    """An Anthropic Messages endpoint that streams one fixed answer."""

    url: str = ""
    text: str = "Change CHG-0001 was applied. The search check passed."
    status: int = 200
    # Seconds the endpoint waits before it answers: a model that is slow or hangs.
    delay_seconds: float = 0.0
    requests: list[dict[str, Any]] = field(default_factory=list)
    _release: threading.Event = field(default_factory=threading.Event)

    def reset(self) -> None:
        self.text = "Change CHG-0001 was applied. The search check passed."
        self.status = 200
        self.delay_seconds = 0.0
        self.requests.clear()
        self.release()

    def release(self) -> None:
        """Let go of any request still being held by ``delay_seconds``."""
        self._release.set()
        self._release = threading.Event()

    def hold(self) -> None:
        if self.delay_seconds:
            self._release.wait(self.delay_seconds)

    def events(self, model: str) -> list[tuple[str, dict[str, Any]]]:
        message = {
            "id": "msg_test", "type": "message", "role": "assistant", "model": model,
            "content": [], "stop_reason": None, "stop_sequence": None,
            "usage": {"input_tokens": 50, "output_tokens": 1},
        }  # fmt: skip
        return [
            ("message_start", {"type": "message_start", "message": message}),
            ("content_block_start", {"type": "content_block_start", "index": 0,
                                     "content_block": {"type": "text", "text": ""}}),
            ("content_block_delta", {"type": "content_block_delta", "index": 0,
                                     "delta": {"type": "text_delta", "text": self.text}}),
            ("content_block_stop", {"type": "content_block_stop", "index": 0}),
            ("message_delta", {"type": "message_delta",
                               "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                               "usage": {"output_tokens": 12}}),
            ("message_stop", {"type": "message_stop"}),
        ]  # fmt: skip


@pytest.fixture(scope="session")
def _model_server() -> Iterator[FakeModel]:
    fake = FakeModel()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            fake.requests.append(
                {
                    "path": self.path,
                    "headers": {k.lower(): v for k, v in self.headers.items()},
                    "body": body,
                }
            )
            fake.hold()
            if fake.status != 200:
                data = json.dumps(
                    {"type": "error", "error": {"type": "api_error", "message": "model is down"}}
                ).encode()
                self._answer(fake.status, "application/json", data)
                return
            data = "".join(
                f"event: {name}\ndata: {json.dumps(payload)}\n\n"
                for name, payload in fake.events(body.get("model", ""))
            ).encode()
            self._answer(200, "text/event-stream", data)

        def _answer(self, status: int, content_type: str, data: bytes) -> None:
            try:
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                pass  # the caller gave up waiting and closed the connection

        def log_message(self, *args: Any) -> None:
            pass

    port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    fake.url = f"http://127.0.0.1:{port}"
    yield fake
    fake.release()
    server.shutdown()


@pytest.fixture
def model(_model_server: FakeModel) -> FakeModel:
    _model_server.reset()
    return _model_server


# -- delivery-mcp -----------------------------------------------------------

REFUSAL = {
    "error": "forbidden",
    "layer": "service",
    "rule": "change_is_approved",
    "message": "change CHG-0001 is proposed, not approved. A change is applied only after an"
    " incident manager has approved it.",
}


@dataclass
class FakeDelivery:
    """A scripted delivery-mcp. ``script`` is the change's status at each read."""

    url: str = ""
    script: list[str] = field(default_factory=lambda: ["applying", "verifying", "applied"])
    refusal: dict[str, Any] | None = None
    # Answer tools/call the way a gateway does for a tool it hides from the caller.
    hidden_by_gateway: bool = False
    calls: list[tuple[str, dict[str, Any], str | None]] = field(default_factory=list)
    reads: int = 0

    def reset(self) -> None:
        self.script = ["applying", "verifying", "applied"]
        self.refusal = None
        self.hidden_by_gateway = False
        self.calls.clear()
        self.reads = 0

    def change(self) -> dict[str, Any]:
        position = min(self.reads, len(self.script) - 1)
        status = self.script[position]
        seen = self.script[: position + 1]
        details = {
            "verifying": "fake applier selected search-service 2.0.0",
            "applied": "search check passed on attempt 1: status 200 with 3 result(s)",
            "failed": "search check failed after 5 attempt(s) in 10s; last: status 500",
        }
        history = [
            {"status": "proposed", "at": "t0", "by": "developer", "detail": None},
            {"status": "approved", "at": "t1", "by": "incident-manager", "detail": None},
        ] + [
            {"status": s, "at": f"t{i + 2}", "by": None, "detail": details.get(s)}
            for i, s in enumerate(dict.fromkeys(seen))
        ]
        self.reads += 1
        return {
            "change_id": "CHG-0001",
            "incident_id": "INC-0001",
            "service": "search-service",
            "target_version": "2.0.0",
            "previous_version": "2.1.0",
            "status": status,
            "operation_id": "op-test",
            "proposed_by": "developer",
            "approved_by": "incident-manager",
            "applied_by": "platform-engineer",
            "detail": details.get(status),
            "history": history,
        }


def _result(payload: dict[str, Any], *, is_error: bool = False) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(payload))],
        structuredContent=payload,
        isError=is_error,
    )


@pytest.fixture(scope="session")
def _delivery_server() -> Iterator[FakeDelivery]:
    fake = FakeDelivery()
    server = FastMCP("fake-delivery-mcp", stateless_http=True)

    def record(tool: str, arguments: dict[str, Any], ctx: Context) -> None:
        request = ctx.request_context.request
        fake.calls.append((tool, arguments, request.headers.get("authorization")))

    @server.tool()
    async def apply_change(change_id: str, ctx: Context) -> CallToolResult:
        record("apply_change", {"change_id": change_id}, ctx)
        if fake.refusal is not None:
            return _result(fake.refusal, is_error=True)
        return _result({**fake.change(), "replayed": False})

    @server.tool()
    async def get_incident(incident_id: str, ctx: Context) -> CallToolResult:
        record("get_incident", {"incident_id": incident_id}, ctx)
        return _result(
            {"incident_id": incident_id, "service": "search-service", "changes": [fake.change()]}
        )

    @server.tool()
    async def post_status_update(incident_id: str, text: str, ctx: Context) -> CallToolResult:
        record("post_status_update", {"incident_id": incident_id, "text": text}, ctx)
        return _result({"incident_id": incident_id})

    mcp_app = server.streamable_http_app()

    async def app(scope: Any, receive: Any, send: Any) -> None:
        """The MCP app, or a JSON-RPC error for tools/call when the gateway hides the tool."""
        if scope["type"] != "http" or scope["method"] != "POST" or not fake.hidden_by_gateway:
            await mcp_app(scope, receive, send)
            return
        body = b""
        while True:
            message = await receive()
            body += message.get("body", b"")
            if not message.get("more_body"):
                break
        request = json.loads(body)
        if request.get("method") != "tools/call":
            replayed = False

            async def replay() -> dict[str, Any]:
                # The body once, then whatever the connection reports (a disconnect).
                nonlocal replayed
                if replayed:
                    return await receive()
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}

            await mcp_app(scope, replay, send)
            return
        answer = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": request["id"],
                "error": {"code": -32602, "message": "Unknown tool: apply_change"},
            }
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(answer)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": answer})

    port = free_port()
    uvicorn_server = serve_in_thread(app, port)
    fake.url = f"http://127.0.0.1:{port}/mcp"
    yield fake
    uvicorn_server.should_exit = True


@pytest.fixture
def delivery(_delivery_server: FakeDelivery) -> FakeDelivery:
    _delivery_server.reset()
    return _delivery_server


# -- the agent --------------------------------------------------------------


@pytest.fixture(scope="session")
def agent_url(
    issuer: Issuer, _delivery_server: FakeDelivery, _model_server: FakeModel
) -> Iterator[str]:
    port = free_port()
    settings = load_settings(
        {
            "OIDC_ISSUER": issuer.issuer,
            "OIDC_JWKS_URL": issuer.jwks_url,
            "OIDC_AUDIENCE": AUDIENCE,
            "DELIVERY_MCP_URL": _delivery_server.url,
            "MODEL_BASE_URL": _model_server.url,
            "MODEL_ID": "test-default-model",
            "MODEL_ID_FAST": FAST_MODEL,
            "PORT": str(port),
            "MODEL_TIMEOUT_SECONDS": str(MODEL_TIMEOUT_SECONDS),
            "FOLLOW_INTERVAL_SECONDS": "0.02",
            "FOLLOW_TIMEOUT_SECONDS": "1",
        }
    )
    server = serve_in_thread(create_app(settings), port)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


@pytest.fixture
async def http() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(timeout=20) as client:
        yield client


def rpc(method: str, text: str | None = None, *, data: dict[str, Any] | None = None) -> dict:
    """An A2A JSON-RPC request carrying one text part or one data part."""
    part = {"kind": "data", "data": data} if data is not None else {"kind": "text", "text": text}
    return {
        "jsonrpc": "2.0",
        "id": uuid.uuid4().hex,
        "method": method,
        "params": {
            "message": {
                "kind": "message",
                "role": "user",
                "messageId": uuid.uuid4().hex,
                "parts": [part],
            }
        },
    }


APPLY = json.dumps({"action": "apply_and_verify", "change_id": "CHG-0001"})


async def stream(
    http: httpx.AsyncClient, url: str, token: str, body: dict[str, Any]
) -> list[dict[str, Any]]:
    """Send ``message/stream`` and return the result of every event."""
    events: list[dict[str, Any]] = []
    async with http.stream(
        "POST",
        url,
        json=body,
        headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
    ) as response:
        assert response.status_code == 200, await response.aread()
        async for line in response.aiter_lines():
            if line.startswith("data:"):
                payload = json.loads(line[5:])
                assert "error" not in payload, payload
                events.append(payload["result"])
    return events


def artifact_parts(events: list[dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    """The text and the data of the one result artifact in a stream."""
    (update,) = [e for e in events if e["kind"] == "artifact-update"]
    parts = update["artifact"]["parts"]
    text = next(p["text"] for p in parts if p["kind"] == "text")
    data = next(p["data"] for p in parts if p["kind"] == "data")
    return text, data
