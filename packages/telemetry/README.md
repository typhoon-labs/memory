# @typhoon/telemetry

OpenTelemetry instrumentation for the Typhoon platform. Provides auto-instrumentation for PostgreSQL, Redis, BullMQ, and HTTP (Hono), plus a Mastra OTel bridge for agent/model/tool spans.

## Architecture

```
App (api/worker/scheduler)
  │  OTLP traces + metrics
  ▼
otel-collector
  ├── spanmetrics connector (derives LLM/queue metrics from span attributes)
  ├── forwards traces → otel-lgtm (Tempo)
  └── forwards metrics → otel-lgtm (Prometheus)
```

LLM token usage, request duration, and queue job metrics are **not manually recorded** — they're derived automatically from span attributes by the OTel Collector's `spanmetrics` connector. Only business metrics that don't correspond to spans (e.g., `conversationStarted`) are recorded manually.

## Setup

Import the instrumentation module **as the very first import** in your app entrypoint:

```ts
import '@typhoon/telemetry/instrumentation';

// ... rest of your app
```

This initializes the OpenTelemetry Node SDK before any other code loads, enabling auto-instrumentation of:
- **PostgreSQL** (`pg`) — query spans
- **Redis** (`ioredis`) — command spans (parent-span-only to avoid flood)
- **BullMQ** — job publish/process spans with producer→consumer linking

## Exports

### Hono Middleware

```ts
import { otelMiddleware } from '@typhoon/telemetry';

app.use('*', otelMiddleware());
```

Wraps `@hono/otel` — creates HTTP server spans, records `http.server.request.duration` histogram, `http.server.active_requests` gauge, and propagates W3C trace context.

### Mastra Integration

```ts
import { createMastraObservability } from '@typhoon/telemetry';

const mastra = new Mastra({
  observability: createMastraObservability('typhoon-api'),
  // ...
});
```

Creates a Mastra Observability instance with the `@mastra/otel-bridge`. Agent/model/tool spans become children of active OTel spans via `AsyncLocalStorage`. The bridge automatically sets GenAI semantic convention attributes:
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- `gen_ai.usage.cached_input_tokens`
- `gen_ai.request.model` / `gen_ai.provider.name`

These span attributes are converted to Prometheus metrics by the spanmetrics connector — no manual recording needed.

### Tracer & Meter

```ts
import { getTracer, getMeter } from '@typhoon/telemetry';

const tracer = getTracer('my-module');
const meter = getMeter('my-module');
```

### Business Metrics

Only metrics that don't correspond to spans are defined here:

```ts
import { conversationStarted } from '@typhoon/telemetry';

conversationStarted.add(1, { agent: 'typhoon-supervisor' });
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP receiver URL |
| `OTEL_SERVICE_NAME` | `typhoon` | Service identifier (e.g., `typhoon-api`) |
| `OTEL_SERVICE_VERSION` | `0.0.0` | Service version |

In Docker Compose, these are set per service and point to `otel-collector:4318`. For non-prod/prod K8s, override `OTEL_EXPORTER_OTLP_ENDPOINT` to point to your OTel-compatible provider.

## Derived Metrics (via spanmetrics connector)

These Prometheus metrics are produced automatically by the OTel Collector from span data — no app code required:

| Prometheus metric | Source |
|-------------------|--------|
| `traces_span_metrics_calls_total{span_name="chat ..."}` | Mastra MODEL_GENERATION spans |
| `traces_span_metrics_duration_milliseconds_*{span_name="chat ..."}` | Span duration |
| `traces_span_metrics_calls_total{gen_ai_operation_name="invoke_agent"}` | Mastra AGENT_RUN spans |
| `http_server_request_duration_seconds_*` | @hono/otel HTTP spans |
| `http_server_active_requests` | @hono/otel gauge |
