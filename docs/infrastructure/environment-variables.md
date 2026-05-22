# Environment Variables

All environment variables are validated at startup using Zod schemas defined in `packages/config/src/env.ts`. The application will refuse to start if required variables are missing or malformed.

## Database

| Variable       | Required | Default | Description                                                    |
| -------------- | -------- | ------- | -------------------------------------------------------------- |
| `DATABASE_URL` | Yes      | --      | PostgreSQL connection string (must include pgvector extension) |

## Redis

| Variable           | Required | Default | Description                                                         |
| ------------------ | -------- | ------- | ------------------------------------------------------------------- |
| `REDIS_URL`        | Yes      | --      | Redis connection string. Use `rediss://` for TLS (e.g. ElastiCache) |
| `REDIS_KEY_PREFIX` | No       | `typhoon`  | App-level prefix for all Redis keys (BullMQ queues + auth sessions) |
| `REDIS_CLUSTER`    | No       | `false` | Set to `true` for AWS ElastiCache cluster mode                      |

## AWS

| Variable     | Required | Default     | Description                                                                    |
| ------------ | -------- | ----------- | ------------------------------------------------------------------------------ |
| `AWS_REGION` | No       | `us-east-1` | AWS region for Bedrock and S3. On EKS, also set by IRSA service account config |

## S3 / MinIO

In direct Bedrock mode with IRSA, `S3_ENDPOINT`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` are optional -- the AWS SDK uses the default credential chain.

| Variable              | Required | Default          | Description                                                                                            |
| --------------------- | -------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `S3_ENDPOINT`         | No       | --               | S3-compatible endpoint URL. Omit for real AWS S3 (SDK infers from region). Set for MinIO/custom stores |
| `S3_REGION`           | No       | `us-east-1`      | AWS region for the S3 bucket                                                                           |
| `S3_ACCESS_KEY`       | No       | --               | Access key. Omit to use the AWS credential chain (IRSA, instance profile)                              |
| `S3_SECRET_KEY`       | No       | --               | Secret key. Omit to use the AWS credential chain                                                       |
| `S3_BUCKET`           | No       | `typhoon-documents` | Default bucket for document storage                                                                    |
| `S3_FORCE_PATH_STYLE` | No       | `true`           | Use path-style URLs. Set to `false` for real AWS S3. Required `true` for MinIO                         |

## LLM Provider

The app supports two modes: **gateway mode** (OpenAI-compatible endpoint like Bifrost) and **direct Bedrock mode** (native AWS SDK). The mode is determined by whether `LLM_BASE_URL` is set. See [AWS Bedrock](./aws-bedrock.md) for production setup.

| Variable                        | Required | Default                        | Description                                                                                                |
| ------------------------------- | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `LLM_BASE_URL`                  | No       | --                             | OpenAI-compatible endpoint. When unset, uses direct Bedrock via AWS SDK                                    |
| `LLM_API_KEY`                   | No       | --                             | API key for the gateway. Only needed when `LLM_BASE_URL` is set                                            |
| `LLM_CHAT_MODEL`                | No       | `anthropic.claude-sonnet-4-6`  | Chat model ID. Gateway: `bedrock/us.anthropic.claude-sonnet-4-6`. Direct: `us.anthropic.claude-sonnet-4-6` |
| `LLM_TITLE_MODEL`               | No       | Falls back to `LLM_CHAT_MODEL` | Lighter model for thread title generation                                                                  |
| `LLM_METADATA_EXTRACTION_MODEL` | No       | Falls back to `LLM_CHAT_MODEL` | Model for extraction during ingestion (title, description, metadata)                                       |
| `LLM_GUARDRAIL_MODEL`           | No       | Falls back to `LLM_CHAT_MODEL` | Model for guardrail processors (moderation, PII detection)                                                 |
| `LLM_KNOWLEDGE_MODEL`           | No       | Falls back to `LLM_CHAT_MODEL` | Model for knowledge agent (search tool routing)                                                            |
| `LLM_CITATION_MODEL`            | No       | Falls back to `LLM_CHAT_MODEL` | Model for citation generation (synthesizing search results with source references)                         |
| `LLM_MAX_RETRIES`               | No       | `3`                            | Maximum retry attempts for LLM calls                                                                       |
| `LLM_RETRY_DELAY_MS`            | No       | `500`                          | Initial retry delay in milliseconds                                                                        |
| `LLM_RETRY_MAX_DELAY_MS`        | No       | `10000`                        | Maximum retry delay in milliseconds                                                                        |
| `ANTHROPIC_API_KEY`             | No       | --                             | Anthropic API key (passed to Bifrost gateway)                                                              |

## Embeddings

Supports gateway mode (`EMBEDDING_BASE_URL` set) or direct Bedrock mode (`EMBEDDING_BASE_URL` unset).

| Variable               | Required | Default                        | Description                                                                                                                      |
| ---------------------- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `EMBEDDING_BASE_URL`   | No       | --                             | OpenAI-compatible embedding endpoint. When unset, uses direct Bedrock via AWS SDK                                                |
| `EMBEDDING_API_KEY`    | No       | --                             | API key for the embedding endpoint                                                                                               |
| `EMBEDDING_MODEL`      | No       | `amazon.titan-embed-text-v2:0` | Embedding model ID                                                                                                               |
| `EMBEDDING_DIMENSION`  | No       | `1024`                         | Vector dimension                                                                                                                 |
| `EMBEDDING_MAX_CHARS`  | No       | `2000`                         | Maximum input characters accepted by the embedding model. Also used as the chunk size ceiling                                    |
| `EMBEDDING_MAX_TOKENS` | No       | `8192`                         | Maximum input tokens accepted by the embedding model. Used with adaptive ratio tracking to proactively split oversized chunks    |
| `EMBEDDING_BATCH_SIZE` | No       | `1`                            | Texts per `embedMany` call. Set >1 for providers that support batch embedding (e.g., OpenAI). Falls back to per-chunk on failure |

### Embedding Rate Limiting

| Variable                           | Required | Default | Description                                                 |
| ---------------------------------- | -------- | ------- | ----------------------------------------------------------- |
| `EMBEDDING_RATE_LIMIT_CONCURRENT`  | No       | `3`     | Maximum concurrent embedding requests                       |
| `EMBEDDING_RATE_LIMIT_INTERVAL_MS` | No       | `200`   | Minimum interval between embedding requests in milliseconds |

These protect upstream embedding providers from burst traffic during bulk ingestion.

## Metadata

| Variable                        | Required | Default | Description                                                      |
| ------------------------------- | -------- | ------- | ---------------------------------------------------------------- |
| `METADATA_EXTRACTION_MAX_CHARS` | No       | `8000`  | Maximum characters of parsed text sent to the LLM for extraction |

## Reranker

Supports gateway mode (`RERANKER_BASE_URL` set, uses Cohere-compatible HTTP endpoint) or direct Bedrock mode (`RERANKER_BASE_URL` unset, uses native Bedrock Rerank API).

| Variable              | Required | Default                     | Description                                                                                                                                           |
| --------------------- | -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RERANKER_BASE_URL`   | No       | --                          | Cohere-compatible rerank endpoint. When unset, uses direct Bedrock Rerank API                                                                         |
| `RERANKER_MODEL`      | No       | --                          | Gateway: model ID (e.g., `bedrock/cohere.rerank-v3-5:0`). Direct: full ARN (e.g., `arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0`) |
| `RERANKER_API_KEY`    | No       | Falls back to `LLM_API_KEY` | API key for the rerank endpoint (gateway mode only)                                                                                                   |
| `RERANKER_TIMEOUT_MS` | No       | `15000`                     | Per-request timeout in milliseconds (gateway mode only)                                                                                               |

## Auth

| Variable          | Required | Default                 | Description                                                                                        |
| ----------------- | -------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`     | Yes      | --                      | Secret for session signing (use a strong random value in production)                               |
| `AUTH_URL`        | No       | `http://localhost:5172` | Base URL for auth endpoints                                                                        |
| `TRUSTED_ORIGINS` | No       | --                      | Comma-separated list of allowed CORS origins (e.g., `http://localhost:5173,http://localhost:5174`) |

## OIDC

| Variable               | Required | Default | Description                                                                                                                             |
| ---------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | No       | --      | OIDC issuer URL (Dex: `http://localhost:5556/dex`, Okta: your tenant URL)                                                               |
| `OIDC_CLIENT_ID`       | No       | --      | OIDC client ID                                                                                                                          |
| `OIDC_CLIENT_SECRET`   | No       | --      | OIDC client secret                                                                                                                      |
| `OIDC_BACKCHANNEL_URL` | No       | --      | Internal OIDC issuer URL for backchannel validation (e.g., `http://dex:5556/dex` in Docker). Falls back to `OIDC_ISSUER_URL` if not set |

### Group-to-Role Mapping

| Variable      | Required | Default | Description                                                         |
| ------------- | -------- | ------- | ------------------------------------------------------------------- |
| `ADMIN_ROLES` | No       | `admin` | Comma-separated list of OIDC group names that map to the admin role |
| `REP_ROLES`   | No       | `rep`   | Comma-separated list of OIDC group names that map to the rep role   |

These allow mapping your IdP's group names to Typhoon application roles. For example, if your Okta groups are named `typhoon-admins` and `typhoon-reps`, set `ADMIN_ROLES=typhoon-admins` and `REP_ROLES=typhoon-reps`.

## Guardrails

| Variable                             | Required | Default | Description                                                                    |
| ------------------------------------ | -------- | ------- | ------------------------------------------------------------------------------ |
| `GUARDRAIL_PROMPT_INJECTION`         | No       | `false` | Enable LLM-based prompt injection detection on user messages                   |
| `GUARDRAIL_MODERATION`               | No       | `false` | Enable content moderation guardrail                                            |
| `GUARDRAIL_PII_DETECTION`            | No       | `false` | Enable PII detection and redaction guardrail                                   |
| `GUARDRAIL_SYSTEM_PROMPT_SCRUBBING`  | No       | `true`  | Enable system prompt scrubbing (no LLM call, rule-based -- always recommended) |

Prompt injection, moderation, and PII detection require an LLM call per request (uses `LLM_GUARDRAIL_MODEL`). System prompt scrubbing is rule-based and adds no latency. Set guardrails to `false` in development for faster iteration; enable in production.

## Scoring / Evals

| Variable                    | Required | Default                     | Description                                                                       |
| --------------------------- | -------- | --------------------------- | --------------------------------------------------------------------------------- |
| `SCORING_ENABLED`           | No       | `true`                      | Set to `false` or `0` to disable automatic scoring (useful during bulk ingestion) |
| `LLM_SCORING_MODEL`         | No       | `claude-haiku-4-5-20251001` | Model used for LLM-based scoring                                                  |
| `LLM_SCORING_MODEL_OPTIONS` | No       | --                          | Comma-separated list of model IDs available for scorer selection in the admin UI  |
| `SCORING_SAMPLE_RATE`       | No       | `1.0`                       | Fraction of conversations to score (0.0 to 1.0)                                   |
| `SCORING_CONCURRENCY`       | No       | `5`                         | Reviews worker concurrency (jobs processed in parallel)                           |
| `SCORING_RUN_CONCURRENCY`   | No       | `10`                        | Scoring worker concurrency per replica                                            |
| `SCORING_RUN_RATE_MAX`      | No       | `15`                        | Maximum scoring jobs per second (rate limiter, per-replica)                       |
| `SPAN_RETENTION_DAYS`       | No       | `90`                        | Telemetry span retention period in days                                           |
| `SCORE_RETENTION_DAYS`      | No       | `0`                         | Score retention period in days (0 = keep forever)                                 |

## Worker Concurrency

| Variable                       | Required | Default  | Description                                              |
| ------------------------------ | -------- | -------- | -------------------------------------------------------- |
| `SYNC_WORKER_CONCURRENCY`      | No       | `5`      | Sync worker concurrency (parallel sync jobs per replica) |
| `SYNC_WORKER_LOCK_DURATION_MS` | No       | `120000` | BullMQ lock duration for sync jobs (2 minutes)           |
| `SYNC_QUEUE_RATE_MAX`          | No       | `10`     | Maximum sync jobs per rate window                        |
| `SYNC_QUEUE_RATE_DURATION_MS`  | No       | `1000`   | Sync rate limiter window in milliseconds                 |
| `EXPERIMENTS_CONCURRENCY`      | No       | `3`      | Experiments worker concurrency                           |
| `HEALTH_PORT`                  | No       | `5170`   | Health server port (worker: 5170, scheduler: 5171)       |

## OpenTelemetry

| Variable                      | Required | Default                 | Description                                                                                                               |
| ----------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No       | `http://localhost:4318` | OTLP receiver URL. In Docker Compose, set to `http://otel-collector:4318`. In K8s, point to your OTel-compatible provider |
| `OTEL_SERVICE_NAME`           | No       | `typhoon`                  | Service identifier (e.g., `typhoon-api`, `typhoon-worker`, `typhoon-scheduler`)                                                    |
| `OTEL_SERVICE_VERSION`        | No       | `0.0.0`                 | Service version for resource attributes                                                                                   |

## Logging

| Variable    | Required | Default | Description                                              |
| ----------- | -------- | ------- | -------------------------------------------------------- |
| `LOG_LEVEL` | No       | --      | Log level: `debug`, `info`, `warn`, `error`, or `silent` |

## RAG Tuning

| Variable                          | Required | Default | Description                                                                            |
| --------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `RAG_RERANK_CANDIDATES`           | No       | `100`   | Fixed number of candidates to retrieve when reranking is enabled (two-stage retrieval) |
| `RAG_RERANK_CANDIDATES_EXPANDED`  | No       | `200`   | Expanded candidate pool for deep/thorough search mode                                  |
| `RAG_RERANK_WEIGHT_SEMANTIC`      | No       | `1.0`   | Reranker weight for Cohere semantic relevance score                                    |
| `RAG_RERANK_WEIGHT_VECTOR`        | No       | `0`     | Reranker weight for original vector/RRF score                                          |
| `RAG_RERANK_WEIGHT_POSITION`      | No       | `0`     | Reranker weight for positional rank                                                    |
| `RAG_RERANK_MIN_SCORE`            | No       | `0.1`   | Minimum reranked score to keep a result                                                |
| `RAG_VECTOR_MIN_SCORE`            | No       | `0.6`   | Minimum vector similarity for API search endpoint                                      |
| `RAG_VECTOR_MIN_SCORE_AGENT`      | No       | `0.5`   | Minimum vector similarity for agent search tools                                       |
| `RAG_GRAPH_THRESHOLD`             | No       | `0.7`   | Graph RAG similarity threshold for edge creation                                       |
| `RAG_KNOWLEDGE_MAX_RESULTS`       | No       | `10`    | Maximum results returned by composite knowledge search                                 |
| `RAG_HYBRID_RRF_K`                | No       | `60`    | RRF constant K for hybrid search merge                                                 |
| `RAG_HYBRID_VECTOR_WEIGHT`        | No       | `0.7`   | Vector score weight in RRF merge                                                       |
| `RAG_HYBRID_FTS_WEIGHT`           | No       | `0.3`   | Full-text search weight in RRF merge                                                   |
| `RAG_HYBRID_CANDIDATE_MULTIPLIER` | No       | `5`     | Internal candidate multiplier for RRF merge (retrieves topK \* N from each modality)   |
| `RAG_FTS_WEIGHT_A`                | No       | `1.0`   | tsvector weight for tier A (title, critical custom fields)                             |
| `RAG_FTS_WEIGHT_B`                | No       | `0.6`   | tsvector weight for tier B (section, keywords, high custom fields)                     |
| `RAG_FTS_WEIGHT_C`                | No       | `0.4`   | tsvector weight for tier C (moderate custom fields — default for searchable metadata)  |
| `RAG_FTS_WEIGHT_D`                | No       | `0.2`   | tsvector weight for tier D (chunk body text, standard custom fields)                   |

**Constraint:** `RAG_RERANK_WEIGHT_SEMANTIC` + `RAG_RERANK_WEIGHT_VECTOR` + `RAG_RERANK_WEIGHT_POSITION` must sum to 1.0. The Zod schema enforces this at startup.

## Server

| Variable | Required | Default   | Description              |
| -------- | -------- | --------- | ------------------------ |
| `PORT`   | No       | `5172`    | HTTP server port         |
| `HOST`   | No       | `0.0.0.0` | HTTP server bind address |

## Validation

All variables are validated by `validateEnv()` in `packages/config/src/env.ts`. The function runs at application startup and throws a descriptive error listing all validation failures if any variables are missing or malformed. Never read `process.env` directly in application code -- use the validated config object instead.
