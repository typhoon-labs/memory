"""OpenTelemetry, configured from the standard environment variables.

Nothing is exported unless ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set. FastMCP emits
its own spans for tool calls once a tracer provider exists; outbound httpx calls
carry W3C trace context.

The audit records (the logger ``delivery.audit``) are sent to the same endpoint
as OTLP logs, and no other log record is: the rest of the service's log stays in
the pod's log.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from opentelemetry.sdk._logs import LoggerProvider

logger = logging.getLogger(__name__)

_configured = False


def setup_telemetry(service_name: str, service_version: str, environment: str) -> bool:
    """Configure tracing and the audit records' export once.

    Returns True when exporters were installed. Logs use the same endpoint and
    protocol as traces (``OTEL_EXPORTER_OTLP_PROTOCOL``): over HTTP they go to
    ``<endpoint>/v1/logs``.
    """
    global _configured
    if _configured:
        return True
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip():
        return False

    from opentelemetry import trace
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    protocol = os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc").strip().lower()
    if protocol.startswith("http"):
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    else:
        from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

    resource = Resource.create(
        {
            "service.name": os.environ.get("OTEL_SERVICE_NAME", "").strip() or service_name,
            "service.version": service_version,
            "deployment.environment": environment,
        }
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    HTTPXClientInstrumentor().instrument()

    logs = LoggerProvider(resource=resource)
    logs.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    attach_audit_handler(logs)

    _configured = True
    logger.info("OpenTelemetry tracing and audit records enabled (%s)", protocol)
    return True


def attach_audit_handler(provider: LoggerProvider) -> logging.Handler:
    """Hand the records of the logger ``delivery.audit``, and only those, to ``provider``.

    The handler is attached to that logger, not to the root. It turns each
    record's ``extra`` fields into the OTLP record's attributes, and takes the
    trace and span ids from the active span. Returns the handler.
    """
    from opentelemetry.instrumentation.logging.handler import LoggingHandler

    from .audit import LOGGER

    handler = LoggingHandler(logger_provider=provider)
    logging.getLogger(LOGGER).addHandler(handler)
    return handler


def instrument_app(app: object) -> None:
    """Create a server span for each HTTP request, continuing the caller's trace."""
    if not _configured:
        return
    # The probes are not traced. The instrumentation reads the paths to leave out
    # from this variable when it is imported; instrument_app takes no such argument.
    os.environ.setdefault("OTEL_PYTHON_STARLETTE_EXCLUDED_URLS", "healthz")
    from opentelemetry.instrumentation.starlette import StarletteInstrumentor

    StarletteInstrumentor.instrument_app(app)  # type: ignore[arg-type]
