"""Tracing switched on, as the cluster runs it.

Every other test runs with tracing off, which is how a start-up failure that
only happens with ``OTEL_EXPORTER_OTLP_ENDPOINT`` set went unnoticed. These run
in a process of their own, because switching tracing on installs a tracer
provider for the whole process.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from opentelemetry.proto.collector.logs.v1.logs_service_pb2 import ExportLogsServiceRequest
from opentelemetry.proto.common.v1.common_pb2 import AnyValue

SRC = Path(__file__).resolve().parents[1] / "src"

CODE = """
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from delivery.telemetry import instrument_app, setup_telemetry

assert setup_telemetry("test", "0", "dev") is True
app = Starlette(routes=[Route("/healthz", lambda request: PlainTextResponse("ok"))])
instrument_app(app)
assert TestClient(app).get("/healthz").status_code == 200
"""


def test_the_app_starts_and_answers_with_tracing_on():
    env = {
        **os.environ,
        "PYTHONPATH": str(SRC),
        # Nothing listens here; spans are dropped when the process ends.
        "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:9",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
        "OTEL_BSP_EXPORT_TIMEOUT": "500",
    }
    done = subprocess.run(
        [sys.executable, "-c", CODE],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr[-2000:]


AUDIT = """
import logging, sys

from opentelemetry import trace

from delivery import audit
from delivery.identity import caller_from_claims
from delivery.telemetry import setup_telemetry

# As src/main.py configures the log.
logging.basicConfig(level="INFO", handlers=[logging.StreamHandler(sys.stderr)])
assert setup_telemetry("delivery-mcp", "9.9.9", "dev") is True
assert [type(h).__name__ for h in logging.getLogger("delivery.audit").handlers] == [
    "LoggingHandler"
]
assert [type(h).__name__ for h in logging.getLogger().handlers] == ["StreamHandler"]

caller = caller_from_claims(
    {
        "preferred_username": "platform-engineer",
        "sub": "u-1",
        "iss": "http://chain-sts.chain-sts.svc.cluster.local",
        "jti": "j-1",
        "roles": ["platform-engineer"],
        "team": "platform",
        "act": {"client_id": "remediation-agent", "act": {"client_id": "chat-assistant"}},
    }
)
with trace.get_tracer("test").start_as_current_span("tools/call apply_change") as span:
    fields = {"change.id": "CHG-0001", "operation.id": "op-1", "helm.revision": 7}
    audit.emit("change.applied", caller, fields)
    print(format(span.get_span_context().trace_id, "032x"))
logging.getLogger("delivery.service").warning("not an audit record")
logging.getLogger().warning("nor this")
# The log records still waiting are sent when the process ends.
"""


class _Collector:
    """Takes what is posted, and answers as the collector does when it accepts."""

    def __init__(self) -> None:
        self.received: list[tuple[str, bytes]] = []
        received = self.received

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - http.server's name
                received.append((self.path, self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(200)
                self.send_header("Content-Type", "application/x-protobuf")
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


def _value(value: AnyValue) -> Any:
    kind = value.WhichOneof("value")
    if kind == "array_value":
        return [_value(v) for v in value.array_value.values]
    return getattr(value, kind)


def test_audit_records_and_only_they_are_sent_as_otlp_logs():
    collector = _Collector()
    env = {
        **os.environ,
        "PYTHONPATH": str(SRC),
        "OTEL_EXPORTER_OTLP_ENDPOINT": collector.url,
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    }
    done = subprocess.run(
        [sys.executable, "-c", AUDIT],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    collector.server.shutdown()
    assert done.returncode == 0, done.stderr[-2000:]
    trace_id = done.stdout.strip()

    logs = [body for path, body in collector.received if path == "/v1/logs"]
    records = [
        (resource_logs.resource, record)
        for body in logs
        for resource_logs in ExportLogsServiceRequest.FromString(body).resource_logs
        for scope_logs in resource_logs.scope_logs
        for record in scope_logs.log_records
    ]
    assert len(records) == 1, records
    resource, record = records[0]
    assert {a.key: _value(a.value) for a in resource.attributes}["service.name"] == "delivery-mcp"
    assert {a.key: _value(a.value) for a in record.attributes} == {
        "audit.event": "change.applied",
        "audit.outcome": "succeeded",
        "change.id": "CHG-0001",
        "operation.id": "op-1",
        "helm.revision": 7,
        "user.id": "platform-engineer",
        "user.sub": "u-1",
        "user.roles": ["platform-engineer"],
        "user.team": "platform",
        "user.issuer": "http://chain-sts.chain-sts.svc.cluster.local",
        "token.jti": "j-1",
        "actor.chain": "remediation-agent,chat-assistant",
    }
    # The handler took the trace from the span that was active.
    assert record.trace_id.hex() == trace_id and len(record.span_id) == 8
    # The pod's log has the same record, as JSON.
    assert '"audit.event": "change.applied"' in done.stderr
    assert "not an audit record" in done.stderr
