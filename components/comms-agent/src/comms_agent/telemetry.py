"""OpenTelemetry, configured from the standard environment variables.

Nothing is exported unless ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set. Strands emits
its own spans for the agent and its model call once a tracer provider exists;
outbound httpx calls (delivery-mcp, the model endpoint) carry W3C trace context.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_configured = False


def setup_telemetry(service_name: str, service_version: str, environment: str) -> bool:
    """Configure tracing once. Returns True when an exporter was installed."""
    global _configured
    if _configured:
        return True
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip():
        return False

    from opentelemetry import trace
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    protocol = os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc").strip().lower()
    if protocol.startswith("http"):
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    else:
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
    _configured = True
    logger.info("OpenTelemetry tracing enabled (%s)", protocol)
    return True


def instrument_app(app: object) -> None:
    """Create a server span for each HTTP request, continuing the caller's trace."""
    if not _configured:
        return
    # The probes are not traced. The instrumentation reads the paths to leave out
    # from this variable when it is imported; instrument_app takes no such argument.
    os.environ.setdefault("OTEL_PYTHON_STARLETTE_EXCLUDED_URLS", "healthz")
    from opentelemetry.instrumentation.starlette import StarletteInstrumentor

    StarletteInstrumentor.instrument_app(app)  # type: ignore[arg-type]
