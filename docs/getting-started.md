# Getting Started

## Prerequisites

- **Bun** 1.3.11+ — [install](https://bun.sh)
- **Docker** and **Docker Compose** — [install](https://docs.docker.com/get-docker/)

## Setup

### 1. Install dependencies and start infrastructure

```bash
bun run setup
```

This script:
1. Checks prerequisites (Bun, Docker, Docker Compose)
2. Runs `bun install` (installs git hooks via lefthook in local dev; skipped in Docker builds)
3. Copies `.env.example` to `.env` (if not present)
4. Starts Docker services (PostgreSQL + pgvector, Redis, MinIO)
5. Waits for PostgreSQL to be ready
6. Runs database migrations

### 2. Configure environment (optional)

The default `.env` is pre-configured with Bifrost (LLM gateway) and Amazon Titan embeddings via Bedrock. This works out of the box if your AWS credentials are set up.

To use different providers, edit `.env`:

```bash
# LLM — any OpenAI-compatible endpoint
LLM_BASE_URL=http://localhost:8787/v1
LLM_API_KEY=changeme

# Embeddings — any OpenAI-compatible endpoint
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=nomic-embed-text
```

See [Environment Variables](environment-variables.md) for the full reference.

### 3. Start the development server

```bash
bun run dev
```

This starts all services via Turborepo. If you only need a specific service, use a targeted script instead:

```bash
bun run dev:api      # API server only
bun run dev:desk     # Rep desk only
bun run dev:admin    # Admin dashboard only
bun run dev:backend  # API + worker + scheduler (no frontends)
```

Full `bun run dev` starts:
- **API server** on `http://localhost:5172`
- **Rep desk** on `http://localhost:5173`
- **Admin dashboard** on `http://localhost:5174`
- **Widget** on `http://localhost:5175`

### 4. Log in

The app uses **SSO only** (email/password login is disabled). In development, a local Dex OIDC provider handles authentication.

1. Open `http://localhost:5174` (admin) or `http://localhost:5173` (desk)
2. Click **"Sign in with SSO"**
3. You'll be redirected to the Dex login form
4. Enter credentials and click **Login**:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@typhoon.local` | `password` |
| Rep | `rep@typhoon.local` | `password` |

You'll be redirected back to the app, logged in.

### 5. Seed sample data (optional)

```bash
bun run seed:db     # Populates DB with sample sync targets, documents, threads, and messages
bun run seed:docs   # Uploads sample documents to MinIO
```

This gives you realistic data to explore the app without manual setup. `seed:db` is idempotent — safe to run multiple times.

## Adding Your First Sync Source

1. Open the admin dashboard at `http://localhost:5174`
2. Navigate to **Sync Sources**
3. Click **Add Source** and enter:
   - **Name:** e.g., "Support Docs"
   - **Bucket:** `typhoon-documents`
   - **Prefix:** (optional, e.g., `support/`)
4. Upload documents to MinIO — either:
   - **Quick:** Run `bun run seed:docs` to upload sample documents automatically
   - **Manual:** Open MinIO console at `http://localhost:9001` (login: `minioadmin` / `minioadmin`) and upload PDF, DOCX, XLSX, Markdown, HTML, or text files to the `typhoon-documents` bucket
5. Click **Sync Now** on the sync source to trigger ingestion
6. Documents will be parsed, chunked, embedded, and stored in pgvector

## Testing the Chat

1. Open the rep desk at `http://localhost:5173`
2. Click **Chat** in the sidebar
3. Ask a question about your uploaded documents
4. The agent searches the knowledge base and responds with citations

## Optional Services

### Bifrost (LLM Gateway)

Bifrost starts automatically as part of the `infra` profile when you run `bun run setup` or `bun run docker:up`. To start it standalone:

```bash
./scripts/docker.sh up bifrost -d
```

Then set in `.env`:
```
LLM_BASE_URL=http://localhost:8787/v1
LLM_API_KEY=changeme
```

### Dex (OIDC Provider)

Dex starts automatically as part of the `infra` profile when you run `bun run setup` or `bun run docker:up`. To start it standalone:

```bash
./scripts/docker.sh up dex -d
```

Login: `admin@typhoon.local` / `password`

### Observability (Grafana LGTM)

All services are instrumented with OpenTelemetry. Locally, traces, metrics, and logs are collected by an all-in-one Grafana LGTM stack (Loki + Grafana + Tempo + Prometheus). In non-prod/prod, OTel exports to an external provider.

Open Grafana at `http://localhost:3000` (no login required).

**Pre-built dashboards** (organized into folders — overview, app, infra):

| Folder | Dashboard | What it shows |
|--------|-----------|--------------|
| overview | Golden Signals | Service health (PostgreSQL, Redis, MinIO, Bifrost, Dex), key metrics per component, error logs |
| app | API Server | HTTP request rate/duration/errors by route, agent runs, active conversations |
| app | Worker (BullMQ) | Job processing duration, call rate, traces, logs |
| app | LLM Operations | LLM call rate/duration by model, agent invocations, conversations |
| infra | PostgreSQL | Connections, sessions, CRUD rates, cache hit ratio, locks, checkpoints (community #9628) |
| infra | Redis | Memory, fragmentation, commands/s, hits/misses, network I/O (community #763) |
| infra | MinIO (S3) | Storage, objects, S3 request rate/errors, TTFB, cluster health (community #13502) |
| infra | Bifrost (LLM Gateway) | Request rate/latency by provider/model, token usage, cost (USD), TTFT, ITL |
| infra | OTel Collector | Pipeline stats, exporter queue, scrape targets (community #15983) |

**Trace-log correlation:** Structured logs include `trace_id` and `span_id` fields. Click a trace in Tempo to jump to its logs in Loki, and vice versa.

LLM token usage, request duration, and queue job metrics are derived automatically from span attributes by the OTel Collector's spanmetrics connector — see [infrastructure docs](infrastructure.md#observability-grafana-lgtm) for details.

## Resetting the Environment

```bash
bun run reset
```

This tears down Docker volumes, removes `node_modules`, and re-runs setup from scratch.

## Troubleshooting

Run `bun run doctor` to check the health of all services at a glance.

**Port already in use**
A previous session may have left containers running. Stop them with `bun run docker:down` and retry. If a non-Docker process holds the port, find it with `lsof -i :<port>`.

**Docker not running**
Start Docker Desktop (macOS/Windows) or the Docker daemon (`sudo systemctl start docker` on Linux).

**Migration failed**
Check that PostgreSQL is healthy: `bun run docker:status`. If it's stuck, try `bun run reset` for a clean slate.

**Can't log in / SSO redirect fails**
Ensure the Dex container is running: `bun run docker:status`. Check Dex logs for errors: `bun run docker:logs 2>&1 | grep dex`. Verify that `OIDC_ISSUER_URL` in `.env` points to `http://localhost:5556/dex`.

**Services not responding**
Run `bun run docker:logs` to tail all container logs and look for startup errors.
