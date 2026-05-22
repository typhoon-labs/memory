# Docker Services

All Typhoon infrastructure and application services are defined in Docker Compose. Two compose files are used:

- `infra/docker/docker-compose.yml` -- base service definitions
- `infra/docker/docker-compose.dev.yml` -- development overrides (hot-reload, volume mounts)

## The docker.sh Wrapper

The `scripts/docker.sh` wrapper is the only supported way to invoke Docker Compose:

```bash
#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROJECT_NAME=typhoon

COMPOSE="-f infra/docker/docker-compose.yml"
[ "${PROD:-}" != "1" ] && COMPOSE="$COMPOSE -f infra/docker/docker-compose.dev.yml"

exec docker compose $COMPOSE \
  --env-file .env \
  --profile all "$@"
```

It handles:

- **Multi-file compose** -- merges the base and dev files (dev mode is the default)
- **Environment** -- loads `.env` via `--env-file`
- **Project name** -- sets `COMPOSE_PROJECT_NAME=typhoon` for predictable container names
- **Profile** -- always uses `--profile all` to start every service

Running raw `docker compose` will miss these settings and break.

For **production mode**, set `PROD=1` to use only the base compose file (no dev overrides):

```bash
PROD=1 ./scripts/docker.sh up -d
```

## Services

| Service      | Image                      | Port(s)                    | Profile       | Description                                    |
| ------------ | -------------------------- | -------------------------- | ------------- | ---------------------------------------------- |
| `postgres`   | `pgvector/pgvector:pg17`   | 5432                       | infra         | PostgreSQL 17 with pgvector extension          |
| `redis`      | `redis:8-bookworm`         | 6379                       | infra         | Cache and BullMQ job queue                     |
| `minio`      | `minio/minio:latest`       | 9000 (API), 9001 (console) | infra         | S3-compatible object storage                   |
| `minio-init` | `minio/mc:latest`          | --                         | infra         | Creates the `typhoon-documents` bucket on startup |
| `bifrost`    | `maximhq/bifrost:v1.5.2`   | 8787                       | infra         | LLM gateway proxy (Anthropic, OpenAI, Bedrock) |
| `dex`        | `dexidp/dex:v2.45.1`       | 5556                       | infra         | OIDC provider for local SSO testing            |
| `otel-lgtm`  | `grafana/otel-lgtm:latest` | 3000, 4317, 4318           | observability | All-in-one Grafana + Loki + Tempo + Prometheus |
| `migrate`    | (local build)              | --                         | app           | Database migrations (one-shot)                 |
| `worker`     | (local build)              | 5170 (health)              | app           | BullMQ job consumer (ingestion, scoring)       |
| `scheduler`  | (local build)              | 5171 (health)              | app           | Cron scheduler (enqueues sync scans)           |
| `api`        | (local build)              | 5172                       | app           | Typhoon API server                                |
| `desk`       | (local build)              | 5173                       | app           | Rep workspace SPA                              |
| `admin`      | (local build)              | 5174                       | app           | Admin dashboard SPA                            |
| `widget`     | (local build)              | 5175                       | app           | Embeddable chat widget                         |

## Service Profiles

All services require a profile. Use `--profile <name>` to select which services to start:

| Profile         | Services                                             |
| --------------- | ---------------------------------------------------- |
| `all`           | Everything (infra + app + observability)             |
| `infra`         | postgres, redis, minio, minio-init, bifrost, dex     |
| `app`           | migrate, api, worker, scheduler, desk, admin, widget |
| `migrate`       | migrate only                                         |
| `observability` | otel-lgtm only                                       |

The `docker.sh` wrapper always uses `--profile all`.

## Volumes

| Volume          | Service  | Description                      |
| --------------- | -------- | -------------------------------- |
| `postgres_data` | postgres | Database files                   |
| `redis_data`    | redis    | Redis persistence                |
| `minio_data`    | minio    | Object storage files             |
| `bifrost_data`  | bifrost  | Bifrost config and logs (SQLite) |

## Development Overrides

In development, `docker-compose.dev.yml` overrides the app services to mount source code and enable hot-reload:

- **api / worker / scheduler** -- `bun run --watch` restarts on file changes
- **desk / admin / widget** -- Vite dev server with HMR (port 80 inside container, mapped to 5173/5174/5175)

Source is mounted via a named volume (`dev_node_modules`) so `node_modules` stays inside the container and is not overwritten by the host mount.

## Health Checks

All core services include Docker health checks:

| Service    | Health check command |
| ---------- | -------------------- |
| PostgreSQL | `pg_isready -U typhoon` |
| Redis      | `redis-cli ping`     |
| MinIO      | `mc ready local`     |

The `minio-init` service waits for MinIO to be healthy before creating the default bucket.

Use `bun run doctor` to check health of all services (DB, Redis, MinIO, API endpoints) from outside Docker.

## Bifrost LLM Gateway

**Config:** `infra/docker/bifrost/config.json`

Bifrost is an OpenAI-compatible LLM gateway that proxies requests to multiple providers with retry logic and logging.

**Configured providers:**

- Anthropic (API key from env)
- OpenAI (API key from env)
- AWS Bedrock (IAM credentials from env)

Bifrost starts automatically with the `infra` or `all` profile.

**Usage:** Set `LLM_BASE_URL=http://localhost:8787/v1` in `.env` to route LLM requests through Bifrost. The reranker also goes through Bifrost when `RERANKER_BASE_URL` points to it.

## Dex OIDC Provider

**Config:** `infra/docker/dex/config.yml`

Dex provides local OIDC authentication for testing SSO flows before connecting to production providers like Okta.

**Static users:**

| Email              | Password   | Role  |
| ------------------ | ---------- | ----- |
| `admin@typhoon.local` | `password` | admin |
| `rep@typhoon.local`   | `password` | rep   |

Dex starts automatically with the `infra` or `all` profile.

## MinIO Console

Access the MinIO web console at `http://localhost:9001`:

- **Username:** `minioadmin`
- **Password:** `minioadmin`

Use it to browse and upload documents to the `typhoon-documents` bucket for testing. The `minio-init` container creates this bucket automatically on startup.
