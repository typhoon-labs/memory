"""Test fixtures.

The tools are tested the way they are used: over Streamable HTTP, with a real
signed token on every call. A signing key is generated for the test session and
kept in memory; its JWKS is served from a local port, and the service fetches
it from there as it would from Keycloak.
"""

from __future__ import annotations

import asyncio
import json
import socket
import sys
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from test_issuer import TestIssuer, serve  # noqa: E402

from core.server import DynamicMCPServer  # noqa: E402
from delivery import runtime  # noqa: E402
from delivery.applier import FakeApplier  # noqa: E402
from delivery.config import load_settings  # noqa: E402
from delivery.restarter import FakeRestarter  # noqa: E402
from delivery.service import DeliveryService  # noqa: E402
from delivery.store import Store  # noqa: E402
from delivery.verifier import VerifyResult  # noqa: E402

AUDIENCE = "agentgateway"
RETAINED = ("2.0.0", "2.1.0")
CURRENT = "2.1.0"
TERMINAL = {"applied", "failed", "rejected"}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class StubVerifier:
    ok: bool = True
    detail: str = "stub search check"
    delay_seconds: float = 0.0
    calls: list[str] = field(default_factory=list)

    async def verify(self, service: str) -> VerifyResult:
        self.calls.append(service)
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        return VerifyResult(ok=self.ok, detail=self.detail, attempts=1)


@dataclass
class World:
    service: DeliveryService
    applier: FakeApplier
    verifier: StubVerifier
    restarter: FakeRestarter


@dataclass
class Result:
    is_error: bool
    data: dict[str, Any]
    text: dict[str, Any]


@pytest.fixture(scope="session")
def issuer() -> Iterator[TestIssuer]:
    port = free_port()
    issuer = TestIssuer(issuer=f"http://127.0.0.1:{port}", audience=AUDIENCE)
    server = serve(issuer, port)
    issuer.jwks_url = f"http://127.0.0.1:{port}/jwks"  # type: ignore[attr-defined]
    yield issuer
    server.shutdown()


@pytest.fixture(scope="session")
def server_url(issuer: TestIssuer) -> Iterator[str]:
    settings = load_settings(
        {
            "OIDC_ISSUER": issuer.issuer,
            "OIDC_JWKS_URL": issuer.jwks_url,  # type: ignore[attr-defined]
            "OIDC_AUDIENCE": AUDIENCE,
        }
    )
    dynamic = DynamicMCPServer(name="delivery-mcp", settings=settings)
    dynamic.load_tools()
    port = free_port()
    server = uvicorn.Server(
        uvicorn.Config(dynamic.http_app(), host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True, name="delivery-mcp-under-test")
    thread.start()
    url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 10
    while True:
        try:
            if httpx.get(f"{url}/healthz", timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError("delivery-mcp did not start")
        time.sleep(0.05)
    yield url
    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture
def world(server_url: str) -> Iterator[World]:
    """Fresh, empty state for one test, with fakes the test can inspect."""
    applier = FakeApplier(versions={"search-service": CURRENT})
    verifier = StubVerifier()
    restarter = FakeRestarter()
    service = DeliveryService(
        store=Store(":memory:"),
        applier=applier,
        verifier=verifier,
        restarter=restarter,
        retained_versions=RETAINED,
    )
    runtime.configure(service)
    yield World(service, applier, verifier, restarter)
    runtime.configure(None)


@pytest.fixture
def call(server_url: str, issuer: TestIssuer, world: World):
    """Call a tool as a named identity, or with an explicit token."""

    async def _call(
        tool: str,
        identity: str | None = None,
        *,
        token: str | None = None,
        headers: dict[str, str] | None = None,
        **arguments: Any,
    ) -> Result:
        bearer = token if token is not None else issuer.mint(identity or "developer")
        transport = StreamableHttpTransport(f"{server_url}/mcp", auth=bearer, headers=headers or {})
        async with Client(transport) as client:
            result = await client.call_tool(tool, arguments, raise_on_error=False)
        text = result.content[0].text if result.content else "{}"
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = {"raw": text}
        return Result(
            is_error=bool(result.is_error),
            data=result.structured_content or {},
            text=parsed,
        )

    return _call


@pytest.fixture
def follow(call):
    """Read a change until it stops moving."""

    async def _follow(incident_id: str, change_id: str, timeout: float = 5.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while True:
            incident = (await call("get_incident", "developer", incident_id=incident_id)).data
            change = next(c for c in incident["changes"] if c["change_id"] == change_id)
            if change["status"] in TERMINAL:
                return change
            if time.monotonic() > deadline:
                raise AssertionError(f"{change_id} still {change['status']} after {timeout}s")
            await asyncio.sleep(0.02)

    return _follow


@pytest.fixture
def incident(call):
    """An open incident on search-service, with a diagnosis."""

    async def _incident(service: str = "search-service") -> str:
        opened = await call(
            "open_incident",
            "alert-automation",
            service=service,
            severity="sev2",
            summary="Every search fails",
            impact="Users cannot search",
        )
        assert not opened.is_error, opened.data
        return opened.data["incident_id"]

    return _incident


@pytest.fixture
def approved_change(call, incident):
    """An incident with a change proposed by developer and approved by incident-manager."""

    async def _approved() -> tuple[str, str]:
        incident_id = await incident()
        proposed = await call(
            "propose_change", "developer", incident_id=incident_id, target_version="2.0.0"
        )
        assert not proposed.is_error, proposed.data
        change_id = proposed.data["change_id"]
        approved = await call("approve_change", "incident-manager", change_id=change_id)
        assert not approved.is_error, approved.data
        return incident_id, change_id

    return _approved


def assert_refused(result: Result, rule: str) -> None:
    """The result is the contract's refusal, in both forms the MCP result carries."""
    assert result.is_error, result.data
    for body in (result.data, result.text):
        assert set(body) == {"error", "layer", "rule", "message"}, body
        assert body["error"] == "forbidden"
        assert body["layer"] == "service"
        assert body["rule"] == rule
        assert body["message"]


def assert_error(result: Result, error: str, rule: str) -> None:
    assert result.is_error, result.data
    assert set(result.data) == {"error", "layer", "rule", "message"}
    assert (result.data["error"], result.data["layer"], result.data["rule"]) == (
        error,
        "service",
        rule,
    )
