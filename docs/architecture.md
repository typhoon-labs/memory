# Architecture

## Overview

Typhoon is an AI-powered customer service chatbot that ingests documents from S3/MinIO and provides RAG-powered answers through a conversational interface.

```
S3/MinIO ──► BullMQ Sync ──► Parse ──► Chunk ──► Embed ──► PostgreSQL (pgvector)
                                                                  │
Rep ──► Desk App ──► Mastra Agent (SSE) ──► Vector Search ──► Streamed Answer
                                                                  │
Customer ──► Widget (API key) ──► Same Agent ──► Same Flow ───────┘
```

## Monorepo Structure

Built with **Bun workspaces** for dependency management and **Turborepo** for task orchestration.

- `apps/` — Deployable applications (api, worker, scheduler, desk, admin, widget)
- `packages/` — Shared libraries consumed by apps
- `infra/` — Docker Compose infrastructure
- `scripts/` — Development automation

## 3-Layer Dependency Model

```
Layer 2:  agents, ingestion, evals, chat, ui  Domain logic & UI
Layer 1:  db, ai, storage, logger, telemetry, queue  Infrastructure clients
Layer 0:  config, types                  Foundations
```

Higher layers import from lower layers. No circular dependencies. Turborepo enforces build order.

### Package Summary

| Package | Layer | Purpose |
|---------|-------|---------|
| `@typhoon/config` | 0 | Shared TypeScript, Biome, and env configs (Zod validation) |
| `@typhoon/types` | 0 | Zod schemas for domain entities |
| `@typhoon/db` | 1 | Drizzle ORM schemas + migrations (non-Mastra tables) |
| `@typhoon/ai` | 1 | LLM + embedding model factories (AI SDK, OpenAI-compatible) |
| `@typhoon/storage` | 1 | S3/MinIO client (list, download, delete) |
| `@typhoon/logger` | 1 | Structured logging via Mastra logger |
| `@typhoon/telemetry` | 1 | OpenTelemetry SDK, custom metrics, Hono middleware |
| `@typhoon/queue` | 1 | BullMQ job queue wrapper (sync, reviews, scoring, experiments, reports) |
| `@typhoon/agents` | 2 | Mastra supervisor + knowledge agent with RAG tools |
| `@typhoon/evals` | 2 | Scorer categories, scorer construction, scoring/experiment job handlers |
| `@typhoon/ingestion` | 2 | Document parsers, MDocument pipeline, BullMQ sync jobs |
| `@typhoon/chat` | 2 | React chat UI components (streaming, markdown rendering) |
| `@typhoon/ui` | 2 | Shared React component library (Radix UI, shadcn-style) |

## Application Architecture

The backend is split into three independently scalable processes:

```
┌──────────┐    enqueue    ┌─────────┐    consume    ┌──────────┐
│   API    │ ────────────►│  Redis  │◄──────────── │  Worker  │
│  (Hono)  │  queue admin │ (BullMQ)│              │ (BullMQ) │
└──────────┘   SSE events └─────────┘              └──────────┘
                               ▲
                               │ enqueue scan jobs
                          ┌────┴─────┐
                          │Scheduler │
                          │ (Croner) │
                          └──────────┘
         All three ──► PostgreSQL + pgvector
```

### API Server (`apps/api`)

- **Framework:** Mastra + Hono (`@mastra/hono`)
- **Auto-generated endpoints:** Agent generate/stream, memory threads/messages, working memory
- **Custom routes:** Sync targets CRUD, document browsing, feedback, widget chat, auth, queue admin
- **Storage:** PostgresStore (threads, messages, memory) + PgVector (embeddings)
- Enqueues BullMQ jobs but does not consume them

### Worker (`apps/worker`)

- **Headless BullMQ consumer** with four worker pools:
  - **Sync** — processes scan, process-file, and delete-file jobs (downloads from S3/MinIO, parses, chunks, embeds, upserts vectors)
  - **Reviews** — scoring preparation (`score-message`) and aggregation (`score-aggregate`); creates BullMQ Flows that fan out scorer execution to the scoring queue
  - **Scoring** — generic scorer execution (`score-run`); runs a single LLM-based scorer per job, shared by reviews and experiments with priority scheduling
  - **Experiments** — experiment lifecycle (`experiment-setup`, `exp-item-process`, `experiment-complete`); uses BullMQ Flow with multi-step jobs (`moveToWaitingChildren`) for agent call → scoring → result collection
- Scales horizontally (multiple replicas via K8s HPA/KEDA)
- Minimal `/healthz` HTTP endpoint for K8s probes (port 5170)

### Scheduler (`apps/scheduler`)

- **Single-replica cron producer** — reads sync target schedules from DB, enqueues scan jobs
- Uses Croner for cron parsing, polls DB every 60s for schedule changes
- Minimal `/healthz` HTTP endpoint for K8s probes (port 5171)

### Rep Workspace (`apps/desk`)

- **Build:** Vite + React 19
- **Routing:** TanStack Router (code-based routes with `validateSearch` for URL state)
- **Server state:** TanStack Query
- **Chat:** AI SDK React (`@ai-sdk/react` useChat) + Mastra `chatRoute` (SSE)
- **Deep linking:** All filters, selections, and search queries persisted in URL search params via `useSearch`/`useNavigate`
- **Pages:** Dashboard, Chat, Search, Documents

### Admin Dashboard (`apps/admin`)

- Same stack as desk (without chat components)
- **Deep linking:** Filters, pagination, tabs, and detail selections all URL-backed for shareability
- **Pages:** Dashboard, Sources, Source Detail, Documents, Reviews, Datasets, Experiments, Scorers, Traces, Queues

### Customer Widget (`apps/widget`)

- Embeddable React widget using AI SDK React (`@ai-sdk/react` useChat)
- API key gated (per-deployment keys)

## Data Architecture

| Store | Technology | Purpose |
|-------|-----------|---------|
| Relational | PostgreSQL 17 | Sync targets, documents, sync jobs, feedback |
| Vectors | pgvector (PostgreSQL extension) | Document chunk embeddings for RAG |
| Threads/Messages | Mastra PgStore (PostgreSQL) | Conversation storage, message history |
| Memory | Mastra Memory (PostgreSQL + pgvector) | Working memory, semantic recall |
| Cache/Jobs | Redis 8 | BullMQ job queue |
| Files | MinIO (S3-compatible) | Source documents |

## Communication Patterns

| Pattern | Technology | Use Case |
|---------|-----------|----------|
| REST | Hono HTTP (via Mastra) | CRUD operations (sync targets, documents, feedback) |
| SSE | Mastra `chatRoute` + AI SDK | Real-time chat streaming from agents |
| Jobs | BullMQ (Redis) | Background document sync pipeline |
| Cron | Croner | Scheduled sync refresh jobs |

## Agent System

A supervisor agent routes queries to a knowledge search tool that wraps a specialized knowledge agent.

### Supervisor Agent

Routes all interactions via a single `searchKnowledge` tool call per message. Passes the user's full message verbatim — never splits multi-topic questions. Extensible for future agents (billing, account, escalation).

### Knowledge Agent

RAG-powered agent with two search tools, orchestrated by a composite tool using two-stage retrieve-then-rerank:
- **searchKnowledgeBaseHybrid** — keyword (BM25) + vector similarity via weighted RRF. Supports toggling reranking via `createHybridSearchTool({ rerank })`. When used inside the composite tool, individual reranking is disabled.
- **searchKnowledgeBaseGraph** — graph-based retrieval for relationship/comparison queries

Called via `searchKnowledge` composite tool: Phase 1 searches the knowledge base with sub-tools returning broad, un-reranked candidates (`rerank: false`). The composite tool merges results, deduplicates by chunk ID, reranks the combined set with Cohere Rerank cross-encoder, filters (score >= `RAG_RERANK_MIN_SCORE`), and caps at `RAG_KNOWLEDGE_MAX_RESULTS`. Phase 2 generates a cited response with `[Source: N]` references.

### Memory System (Mastra built-in)

| Tier | Purpose |
|------|---------|
| Message history | Last N messages in the current conversation |
| Semantic recall | Vector search over past conversations for relevant context |
| Working memory | Persistent structured data (user preferences, known facts) |

## Evaluation System

Automated scoring evaluates agent responses across two categories:

### Response Quality (always runs)

| Scorer | Measures | Scale |
|--------|----------|-------|
| Answer Relevancy | Is the answer relevant to the question? | 0–1 (higher = better) |
| Faithfulness | Is the answer grounded in retrieved context? | 0–1 (higher = better) |
| Hallucination | Does the answer contain unsupported claims? | 0–1 (higher = worse, inverted for averaging) |

These scorers run on every message, even when the agent answers without retrieving documents. Low faithfulness / high hallucination with empty context is a meaningful quality signal: the agent didn't ground its response.

### Retrieval Quality (runs only when context exists)

| Scorer | Measures | Scale |
|--------|----------|-------|
| Context Relevance | Are the retrieved documents relevant? | 0–1 (higher = better) |
| Context Precision | Are relevant documents ranked higher? | 0–1 (higher = better) |

These scorers evaluate the retrieval pipeline and require non-empty context. When no documents are retrieved, they appear as "N/A" in the UI.

### Averaging

Each category has an independent average. Hallucination is inverted (`1 - score`) before being included in the Response Quality average. Custom scorers (LLM-as-judge) are displayed separately and excluded from category averages.

### Pipelines

- **Reviews** — triggered after each chat message via BullMQ Flow; scores fan out as independent `score-run` jobs on the scoring queue
- **Experiments** — triggered manually; dataset items processed via `exp-item-process` multi-step jobs with the same scoring queue fan-out

## Authentication

- **Reps/Admins:** Better Auth (OIDC via Dex/Okta)
- **Widget:** Deployment-level API keys (one key per widget deployment)
