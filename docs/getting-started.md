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
1. Runs `bun install`
2. Copies `.env.example` to `.env` (if not present)
3. Starts Docker services (PostgreSQL + pgvector, Redis, MinIO)
4. Waits for PostgreSQL to be ready
5. Runs database migrations

### 2. Configure environment

Edit `.env` with your LLM and embedding endpoints. The app connects to OpenAI-compatible endpoints — locally this is typically Bifrost (see [Infrastructure](infrastructure.md)):

```bash
# LLM Gateway (chat)
LLM_BASE_URL=http://localhost:8787/v1
LLM_API_KEY=changeme
ANTHROPIC_API_KEY=sk-ant-...          # Passed to Bifrost, not used directly

# Embeddings (OpenAI-compatible endpoint)
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=
EMBEDDING_MODEL=nomic-embed-text
```

### 3. Start the development server

```bash
bun run dev
```

This starts all services via Turborepo:
- **Mastra server** on `http://localhost:5172`
- **Rep desk** on `http://localhost:5173`
- **Admin dashboard** on `http://localhost:5174`

## Adding Your First Sync Source

1. Open the admin dashboard at `http://localhost:5174`
2. Navigate to **Sync Sources**
3. Click **Add Source** and enter:
   - **Name:** e.g., "Support Docs"
   - **Bucket:** `typhoon-documents`
   - **Prefix:** (optional, e.g., `support/`)
4. Upload documents to MinIO:
   - Open MinIO console at `http://localhost:9001` (login: `minioadmin` / `minioadmin`)
   - Upload PDF, DOCX, XLSX, Markdown, HTML, or text files to the `typhoon-documents` bucket
5. Click **Sync Now** on the sync source to trigger ingestion
6. Documents will be parsed, chunked, embedded, and stored in pgvector

## Testing the Chat

1. Open the rep desk at `http://localhost:5173`
2. Click **Chat** in the sidebar
3. Ask a question about your uploaded documents
4. The agent searches the knowledge base and responds with citations

## Optional Services

### Bifrost (LLM Gateway)

Routes LLM requests through a local gateway with retry logic and logging:

```bash
docker compose -f infra/docker/docker-compose.yml --profile gateway up bifrost -d
```

Then set in `.env`:
```
BIFROST_API_URL=http://localhost:8787
```

### Dex (OIDC Provider)

For testing SSO/OIDC flows locally:

```bash
docker compose -f infra/docker/docker-compose.yml --profile oidc up dex -d
```

Login: `admin@typhoon.local` / `password`

## Resetting the Environment

```bash
bun run reset
```

This tears down Docker volumes, removes `node_modules`, and re-runs setup from scratch.
