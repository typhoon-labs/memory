# Environment Variables

All environment variables are validated at startup using Zod schemas defined in `packages/config/src/env.ts`.

## Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (must include pgvector extension) |

## Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | — | Redis connection string for BullMQ job queue |

## S3 / MinIO

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `S3_ENDPOINT` | Yes | — | S3-compatible endpoint URL (e.g., `http://localhost:9000` for MinIO) |
| `S3_REGION` | No | `us-east-1` | AWS region |
| `S3_ACCESS_KEY` | Yes | — | Access key (MinIO: `minioadmin`) |
| `S3_SECRET_KEY` | Yes | — | Secret key (MinIO: `minioadmin`) |
| `S3_BUCKET` | No | `typhoon-documents` | Default bucket for document storage |

## LLM Gateway

The app connects to an OpenAI-compatible endpoint for chat. Locally this is Bifrost; in production it can be any compatible gateway.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_BASE_URL` | Yes | — | OpenAI-compatible chat endpoint (e.g., `http://localhost:8787/v1`) |
| `LLM_API_KEY` | Yes | — | API key for the LLM gateway |
| `LLM_CHAT_MODEL` | No | `anthropic.claude-sonnet-4-6` | Chat model ID (Bedrock format) |
| `LLM_TITLE_MODEL` | No | Falls back to `LLM_CHAT_MODEL` | Lighter model for thread title generation |
| `LLM_EXTRACTION_MODEL` | No | Falls back to `LLM_CHAT_MODEL` | Model for metadata extraction during ingestion (title, keywords) |
| `LLM_GUARDRAIL_MODEL` | No | Falls back to `LLM_CHAT_MODEL` | Model for guardrail processors (moderation, PII detection) |
| `LLM_KNOWLEDGE_MODEL` | No | Falls back to `LLM_CHAT_MODEL` | Model for knowledge agent (search tool routing) |
| `LLM_CITATION_MODEL` | No | Falls back to `LLM_CHAT_MODEL` | Model for citation generation (synthesizing search results with source references) |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key (passed to Bifrost gateway) |

## Embeddings

The app connects to an OpenAI-compatible endpoint for embeddings.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMBEDDING_BASE_URL` | Yes | — | OpenAI-compatible embedding endpoint (e.g., `http://localhost:11434/v1`) |
| `EMBEDDING_API_KEY` | No | — | API key for the embedding endpoint |
| `EMBEDDING_MODEL` | No | `amazon.titan-embed-text-v2:0` | Embedding model ID (Bedrock format) |
| `EMBEDDING_DIMENSION` | No | `1024` | Vector dimension |
| `EMBEDDING_MAX_CHARS` | No | `50000` | Maximum input characters accepted by the embedding model. Also used as the chunk size ceiling |
| `EMBEDDING_MAX_TOKENS` | No | `8192` | Maximum input tokens accepted by the embedding model. Used with adaptive ratio tracking to proactively split oversized chunks |
| `EMBEDDING_BATCH_SIZE` | No | `1` | Texts per `embedMany` call. Set >1 for providers that support batch embedding (e.g. OpenAI). Falls back to per-chunk on failure |

## Reranker

The app connects to a Cohere-compatible rerank endpoint (e.g. Bifrost gateway proxying to Bedrock).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RERANKER_BASE_URL` | Yes | — | Cohere-compatible rerank endpoint (e.g., `http://bifrost:8787/v1`) |
| `RERANKER_MODEL` | Yes | — | Reranker model ID (e.g., `bedrock/arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0`) |
| `RERANKER_API_KEY` | No | Falls back to `LLM_API_KEY` | API key for the rerank endpoint |

## Auth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | — | Secret for session signing (change in production) |
| `AUTH_URL` | No | `http://localhost:5172` | Base URL for auth endpoints |
| `TRUSTED_ORIGINS` | No | — | Comma-separated list of allowed CORS origins (e.g., `http://localhost:5173,http://localhost:5174`) |

## OIDC (optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OIDC_ISSUER_URL` | No | — | OIDC issuer URL (Dex: `http://localhost:5556/dex`, Okta: your tenant URL) |
| `OIDC_CLIENT_ID` | No | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | No | — | OIDC client secret |

## OpenTelemetry

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | `http://localhost:4318` | OTLP receiver URL. In Docker Compose, set to `http://otel-collector:4318`. In K8s, point to your OTel-compatible provider. |
| `OTEL_SERVICE_NAME` | No | `typhoon` | Service identifier (e.g., `typhoon-api`, `typhoon-worker`, `typhoon-scheduler`) |
| `OTEL_SERVICE_VERSION` | No | `0.0.0` | Service version for resource attributes |

## Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | — | Log level: `debug`, `info`, `warn`, `error`, or `silent` |

## RAG Tuning

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RAG_RERANK_CANDIDATES` | No | `100` | Fixed number of candidates to retrieve when reranking is enabled (two-stage retrieval) |
| `RAG_RERANK_CANDIDATES_EXPANDED` | No | `200` | Expanded candidate pool for deep/thorough search mode |
| `RAG_RERANK_WEIGHT_SEMANTIC` | No | `1.0` | Reranker weight for Cohere semantic relevance score |
| `RAG_RERANK_WEIGHT_VECTOR` | No | `0` | Reranker weight for original vector/RRF score |
| `RAG_RERANK_WEIGHT_POSITION` | No | `0` | Reranker weight for positional rank |
| `RAG_RERANK_MIN_SCORE` | No | `0.1` | Minimum reranked score to keep a result |
| `RAG_VECTOR_MIN_SCORE` | No | `0.6` | Minimum vector similarity for API search endpoint |
| `RAG_VECTOR_MIN_SCORE_AGENT` | No | `0.5` | Minimum vector similarity for agent search tools |
| `RAG_GRAPH_THRESHOLD` | No | `0.7` | Graph RAG similarity threshold for edge creation |
| `RAG_KNOWLEDGE_MAX_RESULTS` | No | `10` | Maximum results returned by composite knowledge search |
| `RAG_HYBRID_RRF_K` | No | `60` | RRF constant K for hybrid search merge |
| `RAG_HYBRID_VECTOR_WEIGHT` | No | `0.7` | Vector score weight in RRF merge |
| `RAG_HYBRID_FTS_WEIGHT` | No | `0.3` | Full-text search weight in RRF merge |
| `RAG_HYBRID_CANDIDATE_MULTIPLIER` | No | `5` | Internal candidate multiplier for RRF merge (retrieves topK * N from each modality) |

## Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5172` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server bind address |
