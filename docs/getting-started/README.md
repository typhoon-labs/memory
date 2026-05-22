# Getting Started

This guide walks you through setting up Typhoon for local development, from prerequisites to your first chat interaction.

## Prerequisites

Before starting, ensure you have the following installed:

| Requirement       | Minimum Version | Install                                           |
| ----------------- | --------------- | ------------------------------------------------- |
| Bun               | 1.3.14+         | [bun.sh](https://bun.sh)                          |
| Docker            | 24+             | [docker.com](https://docs.docker.com/get-docker/) |
| Docker Compose v2 | 2.20+           | Bundled with Docker Desktop                       |

For detailed requirements (OS notes, port list, disk space), see [Prerequisites](prerequisites.md).

## 1. Run the Setup Script

```bash
bun run setup
```

This single command performs the entire first-time setup:

1. **Checks prerequisites** -- verifies Bun, Docker, and Docker Compose are installed and the Docker daemon is running.
2. **Installs dependencies** -- runs `bun install`, which also installs Lefthook git hooks (pre-commit: format + lint; pre-push: typecheck).
3. **Creates `.env`** -- copies `.env.example` to `.env` if no `.env` file exists.
4. **Starts Docker services** -- launches PostgreSQL (with pgvector), Redis, MinIO, Dex (OIDC), Bifrost (LLM gateway), the migration container, and the observability stack (Grafana LGTM).
5. **Waits for migrations** -- the `typhoon-migrate` container runs Drizzle migrations against PostgreSQL. The script waits for it to exit successfully.
6. **Seeds sample data** -- runs `bun run seed` to populate the database with sync targets, scorers, metadata templates, datasets, and uploads sample documents to MinIO.

When complete, the script prints the URLs and credentials you need.

## 2. Configure Environment (Optional)

The default `.env` is pre-configured to use **Bifrost** (a local LLM gateway container) routing to **Amazon Bedrock** with **Amazon Titan V2** embeddings. This works out of the box if your AWS credentials are configured.

To use different providers, edit `.env`:

```bash
# LLM -- any OpenAI-compatible endpoint
LLM_BASE_URL=http://localhost:8787/v1
LLM_API_KEY=changeme
LLM_CHAT_MODEL=bedrock/us.anthropic.claude-sonnet-4-6

# Embeddings -- any OpenAI-compatible endpoint
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=ollama/nomic-embed-text
EMBEDDING_DIMENSION=768
```

See the [Environment Variables](../infrastructure/environment-variables.md) reference for all available settings.

## 3. Start the Development Server

```bash
bun run dev
```

This starts all application services via Turborepo:

| Service         | URL                   |
| --------------- | --------------------- |
| API server      | http://localhost:5172 |
| Rep desk        | http://localhost:5173 |
| Admin dashboard | http://localhost:5174 |
| Customer widget | http://localhost:5175 |

If you only need a specific service, use a targeted script:

```bash
bun run dev:api      # API server only
bun run dev:desk     # Rep desk only
bun run dev:admin    # Admin dashboard only
bun run dev:widget   # Customer widget only
bun run dev:worker   # BullMQ worker only
bun run dev:backend  # API + worker + scheduler (no frontends)
```

See [Scripts Reference](../development/scripts.md) for the full list.

## 4. Log In

Typhoon uses **SSO only** -- email/password login is disabled. In development, a local **Dex** OIDC provider handles authentication.

1. Open http://localhost:5174 (admin) or http://localhost:5173 (rep desk)
2. Click **"Sign in with SSO"**
3. You are redirected to the Dex login form
4. Enter credentials and click **Login**:

| Role  | Email              | Password   |
| ----- | ------------------ | ---------- |
| Admin | `admin@typhoon.local` | `password` |
| Rep   | `rep@typhoon.local`   | `password` |

You are redirected back to the app, logged in.

For programmatic auth and API keys, see the [Auth Overview](../auth/README.md). Dev credentials are listed above (provided by local Dex OIDC).

## 5. Seed Sample Data

If you ran `bun run setup`, sample data was already seeded. To re-seed or seed independently:

```bash
bun run seed
```

This command:

- Seeds the database with sync targets, metadata field groups and templates, scorer definitions, datasets, and experiments
- Generates binary fixtures (PDF, DOCX, XLSX)
- Uploads sample documents to the MinIO `typhoon-documents` bucket

It requires the API, PostgreSQL, and MinIO containers to be running (`bun run docker:up`).

## 6. Add Your First Sync Source

1. Open the admin dashboard at http://localhost:5174
2. Navigate to **Sync Sources**
3. Click **Add Source** and enter:
   - **Name:** e.g., "Support Docs"
   - **Bucket:** `typhoon-documents`
   - **Prefix:** (optional, e.g., `support/`)
4. Upload documents to MinIO -- either:
   - **Quick:** Run `bun run seed` to upload sample documents automatically
   - **Manual:** Open the MinIO console at http://localhost:9001 (login: `minioadmin` / `minioadmin`) and upload PDF, DOCX, XLSX, Markdown, HTML, or text files to the `typhoon-documents` bucket
5. Click **Sync Now** on the sync source to trigger ingestion
6. Documents are parsed, chunked, embedded, and stored in pgvector

## 7. Test the Chat

1. Open the rep desk at http://localhost:5173
2. Click **Chat** in the sidebar
3. Ask a question about your uploaded documents
4. The agent searches the knowledge base and responds with citations

## Optional Services

### Bifrost (LLM Gateway)

Bifrost starts automatically as part of the Docker infrastructure profile. It provides an OpenAI-compatible gateway that routes requests to AWS Bedrock or other providers.

To start it standalone:

```bash
./scripts/docker.sh up bifrost -d
```

Configuration in `.env`:

```
LLM_BASE_URL=http://localhost:8787/v1
LLM_API_KEY=changeme
```

### Dex (OIDC Provider)

Dex starts automatically with the Docker infrastructure. It provides local OIDC authentication with pre-configured dev users.

To start it standalone:

```bash
./scripts/docker.sh up dex -d
```

### Observability (Grafana LGTM)

All services are instrumented with OpenTelemetry. Locally, traces, metrics, and logs are collected by an all-in-one Grafana LGTM stack (Loki + Grafana + Tempo + Prometheus).

Open Grafana at http://localhost:3000 (no login required).

Pre-built dashboards (organized into folders):

| Folder   | Dashboard             | What it shows                                                                                  |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| overview | Golden Signals        | Service health (PostgreSQL, Redis, MinIO, Bifrost, Dex), key metrics per component, error logs |
| app      | API Server            | HTTP request rate/duration/errors by route, agent runs, active conversations                   |
| app      | Worker (BullMQ)       | Job processing duration, call rate, traces, logs                                               |
| app      | LLM Operations        | LLM call rate/duration by model, agent invocations, conversations                              |
| infra    | PostgreSQL            | Connections, sessions, CRUD rates, cache hit ratio, locks, checkpoints                         |
| infra    | Redis                 | Memory, fragmentation, commands/s, hits/misses, network I/O                                    |
| infra    | MinIO (S3)            | Storage, objects, S3 request rate/errors, TTFB, cluster health                                 |
| infra    | Bifrost (LLM Gateway) | Request rate/latency by provider/model, token usage, cost (USD), TTFT, ITL                     |
| infra    | OTel Collector        | Pipeline stats, exporter queue, scrape targets                                                 |

Trace-log correlation is built in: structured logs include `trace_id` and `span_id` fields. Click a trace in Tempo to jump to its logs in Loki, and vice versa.

## Resetting the Environment

```bash
bun run reset
```

This tears down Docker volumes, removes `node_modules` and build caches, and re-runs the full setup from scratch. Use it when things are in a broken state and you want a clean slate.

## Health Check

```bash
bun run doctor
```

Checks the health of all services at a glance -- Docker daemon, containers, PostgreSQL connectivity, pgvector extension, Redis, MinIO bucket, HTTP endpoints, and Grafana.

## Next Steps

- [Prerequisites](prerequisites.md) -- detailed system requirements
- [Auth Overview](../auth/README.md) -- authentication methods, API keys, RBAC
- [Troubleshooting](troubleshooting.md) -- common issues and solutions
- [Development Workflow](../development/README.md) -- day-to-day development guide
- [Scripts Reference](../development/scripts.md) -- all available npm scripts
