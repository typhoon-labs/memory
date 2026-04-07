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
| `all` | Everything (infra + app) |
| `infra` | postgres, redis, minio, minio-init, bifrost, dex |
| `app` | migrate, server, desk, admin, widget |
| `migrate` | migrate only |

`scripts/docker.sh` always uses `--profile all`.

### Services

| Service | Image | Port | Profile | Description |
|---------|-------|------|---------|-------------|
| `postgres` | `pgvector/pgvector:pg17` | 5432 | infra | PostgreSQL 17 with pgvector extension |
| `redis` | `redis:8-alpine` | 6379 | infra | Cache and BullMQ job queue |
| `minio` | `minio/minio:latest` | 9000 (API), 9001 (console) | infra | S3-compatible object storage |
| `minio-init` | `minio/mc:latest` | — | infra | Creates the `typhoon-documents` bucket on startup |
| `bifrost` | `maximhq/bifrost:v1.4.7` | 8787 | infra | LLM gateway proxy (Anthropic, OpenAI, Bedrock) |
| `dex` | `dexidp/dex:v2.41.1` | 5556 | infra | OIDC provider for local SSO testing |
| `migrate` | (local build) | — | app | Database migrations (one-shot) |
| `server` | (local build) | 5172 | app | Typhoon API server |
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

- **server** — `bun run --watch` restarts on file changes
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

**Static user:** `admin@typhoon.local` / `password`

Dex starts automatically with the `infra` or `all` profile (i.e. `./scripts/docker.sh up -d`).

## MinIO Console

Access the MinIO web console at `http://localhost:9001`:
- **Username:** `minioadmin`
- **Password:** `minioadmin`

Use it to upload documents to the `typhoon-documents` bucket for testing.

## Health Checks

All core services include Docker health checks:
- **PostgreSQL:** `pg_isready -U typhoon`
- **Redis:** `redis-cli ping`
- **MinIO:** `mc ready local`

The `minio-init` service waits for MinIO to be healthy before creating the default bucket.
