# Infrastructure

## Docker Compose

**File:** `infra/docker/docker-compose.yml`

### Core Services

These services start by default with `docker compose up`:

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `postgres` | `pgvector/pgvector:pg17` | 5432 | PostgreSQL 17 with pgvector extension |
| `redis` | `redis:8-alpine` | 6379 | Cache and BullMQ job queue |
| `minio` | `minio/minio:latest` | 9000 (API), 9001 (console) | S3-compatible object storage |
| `minio-init` | `minio/mc:latest` | — | Creates the `typhoon-documents` bucket on startup |

### Optional Services (profiles)

Start with `docker compose --profile <profile> up <service> -d`:

| Service | Image | Port | Profile | Description |
|---------|-------|------|---------|-------------|
| `bifrost` | `maximhq/bifrost:v1.4.7` | 8787 | `gateway` | LLM gateway proxy (Anthropic, OpenAI, Bedrock) |
| `dex` | `dexidp/dex:v2.41.1` | 5556 | `oidc` | OIDC provider for local SSO testing |

### Volumes

| Volume | Service | Description |
|--------|---------|-------------|
| `postgres_data` | postgres | Database files |
| `redis_data` | redis | Redis persistence |
| `minio_data` | minio | Object storage files |
| `bifrost_data` | bifrost | Bifrost config and logs (SQLite) |

## Bifrost LLM Gateway

**Config:** `infra/docker/bifrost/config.json`

Bifrost is an OpenAI-compatible LLM gateway that proxies requests to multiple providers with retry logic and logging.

**Configured providers:**
- Anthropic (API key from env)
- OpenAI (API key from env)
- AWS Bedrock (IAM credentials from env)

**Start:**
```bash
docker compose -f infra/docker/docker-compose.yml --profile gateway up bifrost -d
```

**Use:** Set `BIFROST_API_URL=http://localhost:8787` in `.env`.

## Dex OIDC Provider

**Config:** `infra/docker/dex-config.yml`

Dex provides local OIDC authentication for testing SSO flows before connecting to production providers like Okta.

**Static user:** `admin@typhoon.local` / `password`

**Start:**
```bash
docker compose -f infra/docker/docker-compose.yml --profile oidc up dex -d
```

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
