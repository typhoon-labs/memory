"""OpenTelemetry, configured from the standard environment variables.

Nothing is exported unless ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set. Each request
is a server span that continues the caller's trace; the TokenReview calls to
the Kubernetes API server (httpx) carry W3C trace context.

The audit records (logger ``chain_sts.audit``) also go to the same endpoint as
OTLP log records, with the trace and span of the request that made them. Each
carries the attributes its record names in ``extra={"attributes": {...}}``, and
nothing else; the line on standard error is unchanged. Every other log line
stays on standard error only.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from opentelemetry._logs import LoggerProvider

logger = logging.getLogger(__name__)

AUDIT_LOGGER = "chain_sts.audit"
# What every LogRecord has of its own; anything else on a record came in `extra`.
RECORD_KEYS = frozenset(vars(logging.makeLogRecord({})))

_configured = False


def setup_telemetry(service_name: str, service_version: str, environment: str) -> bool:
    """Configure tracing and the audit records' export once. True when exporters were installed."""
    global _configured
    if _configured:
        return True
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip():
        return False

    from opentelemetry import trace
    from opentelemetry._logs import set_logger_provider
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk._logs import LoggerProvider as SdkLoggerProvider
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
    # Both providers flush what they hold when the process exits.
    logs = SdkLoggerProvider(resource=resource)
    logs.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    set_logger_provider(logs)
    export_audit(logs)
    _configured = True
    logger.info("OpenTelemetry tracing and audit logs enabled (%s)", protocol)
    return True


def export_audit(provider: LoggerProvider) -> logging.Handler:
    """Send the audit records, and only those, to `provider`. Returns the handler it attached."""
    # The SDK's own LoggingHandler is deprecated in favor of this one.
    from opentelemetry.instrumentation.logging.handler import LoggingHandler

    handler = LoggingHandler(logger_provider=provider)
    handler.addFilter(audit_attributes)
    logging.getLogger(AUDIT_LOGGER).addHandler(handler)
    return handler


def audit_attributes(record: logging.LogRecord) -> logging.LogRecord:
    """The record as the Collector gets it: the record's `attributes` and nothing else.

    The handler would otherwise send every `extra` as an attribute, the line's
    `fields` among them. A filter that returns a record hands the handler that
    record instead, so the line on standard error still gets the original. An
    attribute without a value is left out, never sent as null.
    """
    attributes = getattr(record, "attributes", None)
    if not isinstance(attributes, Mapping):
        attributes = {}
    own = {k: v for k, v in vars(record).items() if k in RECORD_KEYS}
    given = {k: v for k, v in attributes.items() if v is not None and v != ""}
    return logging.makeLogRecord(own | given)


def instrument_app(app: object) -> None:
    """Create a server span for each HTTP request, continuing the caller's trace."""
    if not _configured:
        return
    # The probes are not traced. The instrumentation reads the paths to leave out
    # from this variable when it is imported; instrument_app takes no such argument.
    os.environ.setdefault("OTEL_PYTHON_STARLETTE_EXCLUDED_URLS", "healthz")
    from opentelemetry.instrumentation.starlette import StarletteInstrumentor

    StarletteInstrumentor.instrument_app(app)  # type: ignore[arg-type]
