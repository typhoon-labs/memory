# Infrastructure

## Docker Compose

**Files:**
- `infra/docker/docker-compose.yml` — service definitions
- `infra/docker/docker-compose.dev.yml` — dev overrides (hot-reload)

### Running Docker

The `scripts/docker.sh` wrapper is the recommended way to invoke Docker Compose. It automatically selects compose files and profiles:

```bash
# Development (default) — merges both compose files, starts everything
./scripts/docker.sh up -d

# Production — base compose file only
PROD=1 ./scripts/docker.sh up -d

# Available as npm scripts
bun run docker:up       # up -d --build
bun run docker:down     # down
bun run docker:build    # build
bun run docker:logs     # logs -f
```

### Service Profiles

All services require a profile. Use `--profile <name>` to select which services to start:

| Profile | Services |
|---------|----------|
| `all` | Everything (infra + app + observability) |
| `infra` | postgres, redis, minio, minio-init, bifrost, dex |
| `app` | migrate, api, worker, scheduler, desk, admin, widget |
| `migrate` | migrate only |
| `observability` | otel-lgtm only |

`scripts/docker.sh` always uses `--profile all`.

### Services

| Service | Image | Port | Profile | Description |
|---------|-------|------|---------|-------------|
| `postgres` | `pgvector/pgvector:pg17` | 5432 | infra | PostgreSQL 17 with pgvector extension |
| `redis` | `redis:8-alpine` | 6379 | infra | Cache and BullMQ job queue |
| `minio` | `minio/minio:latest` | 9000 (API), 9001 (console) | infra | S3-compatible object storage |
| `minio-init` | `minio/mc:latest` | — | infra | Creates the `typhoon-documents` bucket on startup |
| `bifrost` | `maximhq/bifrost:v1.4.7` | 8787 | infra | LLM gateway proxy (Anthropic, OpenAI, Bedrock) |
| `dex` | `dexidp/dex:v2.45.1` | 5556 | infra | OIDC provider for local SSO testing |
| `migrate` | (local build) | — | app | Database migrations (one-shot) |
| `worker` | (local build) | 5170 (health) | app | BullMQ job consumer (ingestion) |
| `scheduler` | (local build) | 5171 (health) | app | Cron scheduler (enqueues sync scans) |
| `api` | (local build) | 5172 | app | Typhoon API server |
| `desk` | (local build) | 5173 | app | Rep workspace SPA |
| `admin` | (local build) | 5174 | app | Admin dashboard SPA |
| `widget` | (local build) | 5175 | app | Embeddable chat widget |

### Volumes

| Volume | Service | Description |
|--------|---------|-------------|
| `postgres_data` | postgres | Database files |
| `redis_data` | redis | Redis persistence |
| `minio_data` | minio | Object storage files |
| `bifrost_data` | bifrost | Bifrost config and logs (SQLite) |

## Development Overrides (`docker-compose.dev.yml`)

In development, `docker-compose.dev.yml` overrides the app services to mount source code and enable hot-reload:

- **api / worker / scheduler** — `bun run --watch` restarts on file changes
- **desk / admin / widget** — Vite dev server with HMR (port 80 inside container, mapped to 5173/5174/5175)

Source is mounted via a named volume (`dev_node_modules`) so `node_modules` stays inside the container and is not overwritten by the host mount.

## Bifrost LLM Gateway

**Config:** `infra/docker/bifrost/config.json`

Bifrost is an OpenAI-compatible LLM gateway that proxies requests to multiple providers with retry logic and logging.

**Configured providers:**
- Anthropic (API key from env)
- OpenAI (API key from env)
- AWS Bedrock (IAM credentials from env)

Bifrost starts automatically with the `infra` or `all` profile (i.e. `./scripts/docker.sh up -d`).

**Use:** Set `LLM_BASE_URL=http://localhost:8787/v1` in `.env` to route LLM requests through Bifrost.

## Dex OIDC Provider

**Config:** `infra/docker/dex/config.yml`

Dex provides local OIDC authentication for testing SSO flows before connecting to production providers like Okta.

**Static users:** `admin@typhoon.local` / `password` (admin), `rep@typhoon.local` / `password` (rep)

Dex starts automatically with the `infra` or `all` profile (i.e. `./scripts/docker.sh up -d`).

## MinIO Console

Access the MinIO web console at `http://localhost:9001`:
- **Username:** `minioadmin`
- **Password:** `minioadmin`

Use it to upload documents to the `typhoon-documents` bucket for testing.

## Observability (Grafana LGTM)

Locally, all observability runs in a single **`otel-lgtm`** container (Grafana + Loki + Tempo + Prometheus) with an overridden internal OTel Collector that handles everything: app OTLP, PostgreSQL/Redis metrics via built-in receivers, Prometheus scrape for MinIO/Bifrost/Dex, Docker container logs via filelog, and LLM metric derivation via spanmetrics. No sidecar containers needed.

In non-prod/prod, the same OTel instrumentation exports to an external provider — only the `OTEL_EXPORTER_OTLP_ENDPOINT` changes. In K8s, replace the filelog receiver with your existing log forwarder (Fluent Bit, Grafana Alloy, etc.).

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `otel-lgtm` | `grafana/otel-lgtm:latest` | 3000 (Grafana), 4317 (gRPC), 4318 (HTTP) | All-in-one Grafana + Loki + Tempo + Prometheus + OTel Collector |

The internal OTel Collector config is overridden to include:
- **OTLP receiver** — app traces + metrics from api, worker, scheduler, bifrost
- **PostgreSQL receiver** — direct connection to postgres:5432 (replaces postgres-exporter)
- **Redis receiver** — direct connection to redis:6379 (replaces redis-exporter)
- **Prometheus scrape** — MinIO, Bifrost, Dex native `/metrics` endpoints
- **filelog receiver** — Docker container logs from `/var/lib/docker/containers` (replaces promtail)
- **spanmetrics connector** — derives LLM/queue Prometheus metrics from span attributes

### Configuration Files

| File | Purpose |
|------|---------|
| `infra/docker/otel/otel-collector-config.yaml` | Consolidated collector config: all receivers, spanmetrics connector, localhost exporters |
| `infra/docker/grafana/provisioning/datasources/` | Prometheus, Loki, Tempo datasource configs with bidirectional trace↔log links |
| `infra/docker/grafana/dashboards/` | Dashboard JSON files organized into folders |

### Grafana Dashboards

Access Grafana at `http://localhost:3000` (admin/admin). Dashboards are organized into three folders:

**Overview**

| Dashboard | What it shows |
|-----------|---------------|
| Golden Signals | Service health (PostgreSQL, Redis, MinIO, Bifrost, Dex), key metrics per component, error logs |

**App**

| Dashboard | What it shows |
|-----------|---------------|
| API Server | HTTP request rate/duration/errors by route, active requests, conversations, agent traces |
| Worker (BullMQ) | Queue depth, job completed/failed/stalled rates, job duration p50/p95/p99, pipeline stage duration p95, embedding chunk size distribution, embed retries, token usage, processFile span duration, traces, logs |
| LLM Operations | LLM call rate/duration by model (from spanmetrics), agent invocations, conversations |

**Infrastructure**

| Dashboard | Source | What it shows |
|-----------|--------|---------------|
| PostgreSQL | Custom (OTel receiver metrics) | Connections, cache hit ratio, transactions, row ops, dead tuples, seq scans, locks, bgwriter |
| Redis | Custom (OTel receiver metrics) | Memory, fragmentation, commands/s, hit rate, evictions, keys by DB, network I/O, clients |
| MinIO (S3) | [Grafana #13502](https://grafana.com/grafana/dashboards/13502) | Storage capacity, objects, S3 request rate/errors, TTFB, network, cluster health, drive status |
| Bifrost (LLM Gateway) | Custom | Request rate/latency by provider/model, token usage, cost (USD), TTFT, ITL, cache hits, traces, logs |
| OTel Collector | [Grafana #15983](https://grafana.com/grafana/dashboards/15983) | Pipeline stats, exporter queue, scrape targets, receiver/processor/exporter metrics |

### How It Fits Together

```
App (api/worker/scheduler) + Bifrost
  │  OTLP traces + metrics
  ▼
otel-lgtm (single container)
  ├── OTel Collector (overridden config)
  │   ├── postgresql receiver → Prometheus (localhost)
  │   ├── redis receiver → Prometheus (localhost)
  │   ├── prometheus scrape (minio, bifrost, dex) → Prometheus (localhost)
  │   ├── spanmetrics connector → derives LLM/queue metrics
  │   ├── filelog receiver → Loki (localhost)
  │   └── OTLP traces → Tempo (localhost)
  ├── Grafana (:3000)
  ├── Prometheus (:9090)
  ├── Loki (:3100)
  └── Tempo (:4418)
```

### Trace-Log Correlation

Bidirectional, works automatically:
- **Log → Trace**: Structured JSON logs include `trace_id` and `span_id` fields. Loki derivedFields link to Tempo.
- **Trace → Log**: Tempo `tracesToLogsV2` filters Loki by trace ID when viewing a trace.

### Application Instrumentation

All three backend services import `@typhoon/telemetry/instrumentation` as their first import, which auto-instruments:
- **PostgreSQL** queries (`@opentelemetry/instrumentation-pg`)
- **Redis** commands (`@opentelemetry/instrumentation-ioredis`)
- **BullMQ** job publish/process (`@appsignal/opentelemetry-instrumentation-bullmq`)
- **HTTP** requests (`@hono/otel`)
- **Mastra** agent/model/tool spans (`@mastra/otel-bridge`)

LLM token usage, request duration, and queue job metrics are **derived from spans** by the spanmetrics connector — not manually recorded. The only manual metric is `conversationStarted` (a business metric with no corresponding span).

See the [`@typhoon/telemetry` README](../packages/telemetry/README.md) for usage details.

## Health Checks

All core services include Docker health checks:
- **PostgreSQL:** `pg_isready -U typhoon`
- **Redis:** `redis-cli ping`
- **MinIO:** `mc ready local`

The `minio-init` service waits for MinIO to be healthy before creating the default bucket.
