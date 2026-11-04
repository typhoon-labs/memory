"""`python -m chain_sts` as a process: it starts, answers, and every log line is JSON.

With an OTLP endpoint, its audit records reach it, and nothing else of its logs.
"""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import sys
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import pytest
import yaml
from conftest import AUDIENCE, COMPONENT, unverified
from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import ExportLogsServiceRequest

from chain_sts.oauth import JWT_TYPE, TOKEN_EXCHANGE


def run(env: dict[str, str]) -> subprocess.Popen:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("OTEL_", "KUBERNETES_"))}
    return subprocess.Popen(
        [sys.executable, "-m", "chain_sts"],
        env=clean | {"PYTHONPATH": str(COMPONENT / "src"), "HOST": "127.0.0.1"} | env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def lines_of(process: subprocess.Popen) -> queue.Queue:
    found: queue.Queue = queue.Queue()

    def read() -> None:
        for line in process.stderr:
            found.put(line)
        found.put(None)

    threading.Thread(target=read, daemon=True).start()
    return found


def listening(lines: queue.Queue) -> str:
    """The address the service listens on, from its start line."""
    while True:
        line = lines.get(timeout=15)
        assert line is not None, "the service stopped before it listened"
        message = json.loads(line)["message"]
        if message.startswith("Uvicorn running on"):
            return re.search(r"http://[\d.]+:\d+", message).group(0)


@pytest.fixture
def collector() -> Iterator[tuple[str, queue.Queue]]:
    """Stands in for the Collector's OTLP/HTTP receiver: its address, and every log record sent.

    Each record arrives as (scope name, the record, its resource's attributes).
    """
    received: queue.Queue = queue.Queue()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            if self.path == "/v1/logs":
                for logs in ExportLogsServiceRequest.FromString(body).resource_logs:
                    resource = {a.key: a.value.string_value for a in logs.resource.attributes}
                    for scope in logs.scope_logs:
                        for record in scope.log_records:
                            received.put((scope.scope.name, record, resource))
            # An empty export response, the same for logs and traces.
            self.send_response(200)
            self.send_header("Content-Type", "application/x-protobuf")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", received
    server.shutdown()
    server.server_close()


def test_audit_records_reach_the_collector(policy, user_token, sa_token, collector, tmp_path):
    endpoint, received = collector
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(policy("jwks")))
    process = run(
        {
            "CHAIN_STS_CONFIG": str(config),
            "PORT": "0",
            "OTEL_EXPORTER_OTLP_ENDPOINT": endpoint,
            "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
            # Export within a tenth of a second rather than the default second.
            "OTEL_BLRP_SCHEDULE_DELAY": "100",
            "OTEL_BSP_SCHEDULE_DELAY": "100",
        }
    )
    try:
        url = listening(lines_of(process))
        trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
        user = user_token("platform-engineer")
        response = httpx.post(
            f"{url}/token",
            data={
                "grant_type": TOKEN_EXCHANGE,
                "subject_token": user,
                "subject_token_type": JWT_TYPE,
                "actor_token": sa_token("chat-assistant"),
                "actor_token_type": JWT_TYPE,
                "audience": AUDIENCE,
            },
            # The caller's trace, which the request's server span continues.
            headers={"traceparent": f"00-{trace_id}-00f067aa0ba902b7-01"},
        )
        assert response.status_code == 200, response.text
        issued = unverified(response.json()["access_token"])
        scope, record, resource = received.get(timeout=10)
    finally:
        process.terminate()
        process.wait(timeout=10)

    # The audit record alone: the lines before it (the key, uvicorn's start)
    # were not sent.
    assert scope == "chain_sts.audit"
    assert resource["service.name"] == "chain-sts"
    assert record.body.string_value == "token exchange issued"
    assert {a.key: a.value.string_value for a in record.attributes} == {
        "audit.event": "token_exchange",
        "audit.outcome": "issued",
        "user.id": "platform-engineer",
        "user.sub": issued["sub"],
        "user.issuer": unverified(user)["iss"],
        "token.jti": issued["jti"],
        "actor.chain": "chat-assistant",
        "token.aud": AUDIENCE,
    }
    assert record.trace_id.hex() == trace_id
    assert record.span_id and record.span_id != bytes(8)


def test_starts_answers_and_logs_json(policy, tmp_path: Path):
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(policy("jwks")))
    process = run({"CHAIN_STS_CONFIG": str(config), "PORT": "0", "APP_VERSION": "9.9.9"})
    try:
        lines = lines_of(process)
        started: dict = {}
        while True:
            line = lines.get(timeout=15)
            assert line is not None, "the service stopped before it listened"
            entry = json.loads(line)
            assert {"time", "level", "logger", "message"} <= entry.keys()
            if entry["message"].startswith("Uvicorn running on"):
                break
            if entry["message"].startswith("signing with kid"):
                started = entry
        url = re.search(r"http://[\d.]+:\d+", entry["message"]).group(0)
        health = httpx.get(f"{url}/healthz").json()
        kid = httpx.get(f"{url}/jwks").json()["keys"][0]["kid"]
        assert health == {
            "status": "ok",
            "service": "chain-sts",
            "version": "9.9.9",
            "keys": {"signing": kid},
        }
        # The start line names the key that signs, by its kid alone.
        assert started["message"] == f"signing with kid {kid}"
        assert started["keys"] == {"signing": kid}
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_configuration_error_exits_2(tmp_path: Path):
    process = run({"CHAIN_STS_CONFIG": str(tmp_path / "missing.yaml")})
    _, err = process.communicate(timeout=15)
    assert process.returncode == 2
    [line] = [json.loads(line) for line in err.splitlines() if line.strip()]
    assert line["level"] == "ERROR"
    assert "cannot read" in line["message"]


def test_no_configuration_named_exits_2():
    process = run({"CHAIN_STS_CONFIG": ""})
    _, err = process.communicate(timeout=15)
    assert process.returncode == 2
    assert "CHAIN_STS_CONFIG" in err
