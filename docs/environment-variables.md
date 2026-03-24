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
| `LLM_CHAT_MODEL` | No | `anthropic.claude-sonnet-4-6-v1:0` | Chat model ID (Bedrock format) |
| `ANTHROPIC_API_KEY` | No | — | Anthropic API key (passed to Bifrost gateway) |

## Embeddings

The app connects to an OpenAI-compatible endpoint for embeddings.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMBEDDING_BASE_URL` | Yes | — | OpenAI-compatible embedding endpoint (e.g., `http://localhost:11434/v1`) |
| `EMBEDDING_API_KEY` | No | — | API key for the embedding endpoint |
| `EMBEDDING_MODEL` | No | `amazon.titan-embed-text-v2:0` | Embedding model ID (Bedrock format) |
| `EMBEDDING_DIMENSION` | No | `1024` | Vector dimension |

## Better Auth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | — | Secret for session signing (change in production) |
| `BETTER_AUTH_URL` | Yes | — | Base URL for auth endpoints (e.g., `http://localhost:4000`) |

## OIDC (optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OIDC_ISSUER_URL` | No | — | OIDC issuer URL (Dex: `http://localhost:5556/dex`, Okta: your tenant URL) |
| `OIDC_CLIENT_ID` | No | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | No | — | OIDC client secret |

## Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server bind address |
