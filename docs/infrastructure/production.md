# Production Deployment

This guide covers the considerations for deploying Typhoon to a production environment. The local Docker Compose setup provides all services in a single host; production separates these into managed services and scalable application containers.

## Deployment Model

Typhoon's backend consists of three application services that can be deployed independently:

| Service     | Replicas | Scaling strategy | Notes                                    |
| ----------- | -------- | ---------------- | ---------------------------------------- |
| `api`       | Multiple | Horizontal (HPA) | Stateless; scale based on request rate   |
| `worker`    | Multiple | HPA or KEDA      | Scale based on queue depth; I/O-bound    |
| `scheduler` | Single   | None             | Runs cron jobs; only one instance needed |

Frontend apps (`desk`, `admin`, `widget`) are static builds served by Nginx or a CDN. They do not require application-level scaling.

## External Services

In production, replace the Docker Compose infrastructure services with managed equivalents:

### PostgreSQL

- Use a managed PostgreSQL service (RDS, Cloud SQL, etc.)
- The `pgvector` extension must be installed and enabled
- Set `DATABASE_URL` to the managed instance connection string
- Drizzle migrations run via the `migrate` service or as a pre-deployment step

### Redis

- Use a managed Redis service (ElastiCache, Memorystore, etc.)
- Set `REDIS_URL` to the managed instance connection string
- Redis is used for BullMQ job queues and does not require persistence for correctness (jobs are re-queued on failure)

### S3

- Use real AWS S3 (or any S3-compatible service)
- Set `S3_BUCKET` and `S3_REGION` to your bucket's name and region
- `S3_ACCESS_KEY` and `S3_SECRET_KEY` are optional -- when omitted, the AWS SDK uses the default credential chain (IRSA on EKS, instance profiles on EC2)
- `S3_ENDPOINT` is optional -- when omitted, the SDK resolves it from the region. Only needed for S3-compatible services (MinIO, etc.)
- Set `S3_FORCE_PATH_STYLE=false` for real AWS S3 (path-style URLs are only needed for MinIO)

## Authentication

### OIDC Provider

Replace Dex with your production OIDC provider (e.g., Okta, Auth0, Microsoft Entra ID):

| Variable               | Production value                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | Your provider's issuer URL (e.g., `https://your-org.okta.com`)                                        |
| `OIDC_CLIENT_ID`       | Client ID from your provider                                                                          |
| `OIDC_CLIENT_SECRET`   | Client secret from your provider                                                                      |
| `OIDC_BACKCHANNEL_URL` | Internal issuer URL if the public URL is not reachable from the API pod (e.g., behind a service mesh) |

### Group-to-Role Mapping

Map your IdP's group names to Typhoon roles:

| Variable      | Example                | Description                         |
| ------------- | ---------------------- | ----------------------------------- |
| `ADMIN_ROLES` | `typhoon-admins,platform` | OIDC groups that grant admin access |
| `REP_ROLES`   | `typhoon-reps,support`    | OIDC groups that grant rep access   |

### Session Security

| Variable          | Production value                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`     | A strong random string (at least 32 characters)                                                                 |
| `AUTH_URL`        | The public URL of the API (e.g., `https://api.typhoon.example.com`)                                                |
| `TRUSTED_ORIGINS` | Comma-separated list of frontend origins (e.g., `https://desk.typhoon.example.com,https://admin.typhoon.example.com`) |

## LLM Provider

### Direct Bedrock (Recommended for AWS)

When `LLM_BASE_URL` is **not set**, the app connects directly to AWS Bedrock using the native SDK with the credential provider chain. This is the recommended approach for EKS deployments with IRSA -- no gateway, no explicit API keys.

See [AWS Bedrock](./aws-bedrock.md) for full setup: IAM policies, IRSA configuration, inference profiles, and model IDs.

### Gateway Mode (Bifrost)

When `LLM_BASE_URL` **is set**, the app routes through an OpenAI-compatible gateway (e.g., Bifrost). This is the default for local development and can also be used in production for multi-provider routing, unified logging, or provider failover.

Set `LLM_BASE_URL` to the gateway endpoint (e.g., `http://bifrost:8787/v1`) and `LLM_API_KEY` to the gateway auth key.

## Observability

### External OTel Endpoint

Change a single environment variable to route telemetry to your provider:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.your-provider.com:4318
```

The application instrumentation (auto-instrumentations for PostgreSQL, Redis, BullMQ, HTTP, Mastra) is identical regardless of the backend. Set `OTEL_SERVICE_NAME` per service (e.g., `typhoon-api`, `typhoon-worker`, `typhoon-scheduler`) for clear identification.

### Log Collection

The local `otel-lgtm` container uses a filelog receiver to scrape Docker container logs. In K8s, replace this with your existing log forwarder:

- **Fluent Bit** -- DaemonSet, already standard in most K8s clusters
- **Grafana Alloy** -- if using Grafana Cloud
- **Vector** -- high-performance alternative

Application logs are structured JSON with `trace_id` and `span_id` fields, so trace-log correlation works automatically with any backend that supports it.

### spanmetrics

If using a managed OTel service, replicate the spanmetrics connector rules from `infra/docker/otel/otel-collector-config.yaml` in your collector configuration. These derive LLM and queue metrics from span attributes, powering the LLM Operations and Worker dashboards.

## Nginx Configuration

The frontend apps are served behind Nginx. Key settings for SSE and streaming:

```nginx
location /api/ {
    proxy_pass http://api:5172/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Required for SSE and chat streaming
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}
```

- `proxy_buffering off` -- prevents Nginx from buffering SSE events (they must arrive immediately)
- `proxy_read_timeout 300s` -- allows long-lived SSE connections (queue events, chat streams)

## Bun Server Configuration

The API server runs on Bun with a 30s global idle timeout. SSE streams opt out individually:

- The `/api/v1/*` rewrite middleware detects `Accept: text/event-stream` requests and calls `server.timeout(req, 0)` to disable the idle timeout for that connection
- This covers both chat streaming and queue event SSE endpoints

No application code changes are needed for production.

## Worker Scaling

Worker replicas are the primary scaling lever. Each replica registers as a consumer on the same Redis queues.

### Concurrency Tuning

| Variable                      | Default | Notes                                                       |
| ----------------------------- | ------- | ----------------------------------------------------------- |
| `SYNC_WORKER_CONCURRENCY`     | `5`     | Parallel sync jobs per replica. I/O-bound (S3 + embeddings) |
| `SYNC_QUEUE_RATE_MAX`         | `10`    | Per-replica rate limit for sync jobs                        |
| `SYNC_QUEUE_RATE_DURATION_MS` | `1000`  | Rate window in milliseconds                                 |
| `SCORING_CONCURRENCY`         | `5`     | Reviews worker concurrency                                  |
| `SCORING_RUN_CONCURRENCY`     | `10`    | Scoring worker concurrency. LLM-bound                       |
| `SCORING_RUN_RATE_MAX`        | `15`    | Per-replica rate limit for scoring jobs                     |
| `EXPERIMENTS_CONCURRENCY`     | `3`     | Experiment worker concurrency                               |

### Scaling Strategies

- **Multiple replicas**: Deploy via K8s HPA or KEDA. Each replica registers as a consumer on the same Redis queues. BullMQ distributes jobs automatically.
- **Per-queue concurrency**: Tune `*_CONCURRENCY` env vars based on available CPU/memory per replica. Sync jobs are I/O-bound (S3 downloads, embeddings); scoring jobs are LLM-bound.
- **Rate limiting**: `SYNC_QUEUE_RATE_MAX` and `SCORING_RUN_RATE_MAX` protect upstream services (S3, LLM APIs) from burst traffic. These are per-replica limits.
- **Stalled job recovery**: BullMQ automatically detects and re-queues stalled jobs.
- **Selective scaling**: Consider running separate replica groups for sync vs scoring workloads with different concurrency settings.
- **Scoring toggle**: Set `SCORING_ENABLED=false` to run sync-only workers during bulk ingestion.

## Environment Variable Checklist

### Direct Bedrock (AWS/EKS with IRSA)

No `LLM_BASE_URL`, `LLM_API_KEY`, `EMBEDDING_BASE_URL`, `RERANKER_BASE_URL`, `S3_ACCESS_KEY`, or `S3_SECRET_KEY` needed -- IRSA handles all AWS credentials.

```
# AWS
AWS_REGION=us-east-1

# Data stores
DATABASE_URL=postgresql://user:pass@your-pg-host:5432/typhoon
REDIS_URL=redis://your-redis-host:6379

# Object storage (IRSA handles credentials)
S3_REGION=us-east-1
S3_BUCKET=typhoon-documents
S3_FORCE_PATH_STYLE=false

# LLM (direct Bedrock -- no gateway URL needed)
LLM_CHAT_MODEL=us.anthropic.claude-sonnet-4-6
LLM_TITLE_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_GUARDRAIL_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_METADATA_EXTRACTION_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_SCORING_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
RERANKER_MODEL=arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0

# Auth
AUTH_SECRET=your-strong-random-secret
AUTH_URL=https://api.typhoon.example.com
TRUSTED_ORIGINS=https://desk.typhoon.example.com,https://admin.typhoon.example.com

# OIDC
OIDC_ISSUER_URL=https://your-org.okta.com
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
ADMIN_ROLES=typhoon-admins
REP_ROLES=typhoon-reps

# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.your-provider.com:4318
```

### Gateway Mode (Non-AWS or Custom)

```
# LLM via gateway
LLM_BASE_URL=https://your-llm-endpoint/v1
LLM_API_KEY=...
EMBEDDING_BASE_URL=https://your-embedding-endpoint/v1
RERANKER_BASE_URL=https://your-reranker-endpoint/v1
RERANKER_MODEL=your-reranker-model-id

# Object storage (explicit credentials)
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=typhoon-documents
```

See [Environment Variables](./environment-variables.md) for the complete reference with defaults and descriptions, and [AWS Bedrock](./aws-bedrock.md) for detailed IRSA and inference profile setup.
