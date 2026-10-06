"""Tracing switched on, as the cluster runs it.

Every other test runs with tracing off, which is how a start-up failure that
only happens with ``OTEL_EXPORTER_OTLP_ENDPOINT`` set went unnoticed. This runs
in a process of its own, because switching tracing on installs a tracer provider
for the whole process.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

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
