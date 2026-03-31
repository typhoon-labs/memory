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

- `apps/` — Deployable applications (server, desk, admin, widget)
- `packages/` — Shared libraries consumed by apps
- `infra/` — Docker Compose infrastructure
- `scripts/` — Development automation

## 3-Layer Dependency Model

```
Layer 2:  agents, ingestion, chat, ui    Domain logic & UI
Layer 1:  db, ai, pg, storage, logger    Infrastructure clients
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
| `@typhoon/pg` | 1 | PostgreSQL storage + PgVector for Mastra |
| `@typhoon/storage` | 1 | S3/MinIO client (list, download, delete) |
| `@typhoon/logger` | 1 | Structured logging via Mastra logger |
| `@typhoon/agents` | 2 | Mastra supervisor + knowledge agent with RAG tools |
| `@typhoon/ingestion` | 2 | Document parsers, MDocument pipeline, BullMQ sync jobs |
| `@typhoon/chat` | 2 | React chat UI components (streaming, markdown rendering) |
| `@typhoon/ui` | 2 | Shared React component library (Radix UI, shadcn-style) |

## Application Architecture

### API Server (`apps/server`)

- **Framework:** Mastra + Hono (`@mastra/hono`)
- **Auto-generated endpoints:** Agent generate/stream, memory threads/messages, working memory
- **Custom routes:** Sync targets CRUD, document browsing, feedback, widget chat, auth
- **Background workers:** BullMQ for S3 sync pipeline
- **Storage:** PostgresStore (threads, messages, memory) + PgVector (embeddings)

### Rep Workspace (`apps/desk`)

- **Build:** Vite + React 19
- **Routing:** TanStack Router
- **Server state:** TanStack Query
- **Chat:** AI SDK React (`@ai-sdk/react` useChat) + Mastra `chatRoute` (SSE)
- **Pages:** Dashboard, Chat, Search, Documents

### Admin Dashboard (`apps/admin`)

- Same stack as desk (without chat components)
- **Pages:** Dashboard, Sync Sources, Sync Source Detail, Documents, Feedback

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

A supervisor agent classifies queries and routes to specialized subagents.

### Supervisor Agent

Routes all interactions. Currently delegates to the Knowledge Agent; extensible for future agents (billing, account, escalation).

### Knowledge Agent

RAG-powered agent that searches the knowledge base using `createVectorQueryTool`. Answers only from ingested documents with source citations.

### Memory System (Mastra built-in)

| Tier | Purpose |
|------|---------|
| Message history | Last N messages in the current conversation |
| Semantic recall | Vector search over past conversations for relevant context |
| Working memory | Persistent structured data (user preferences, known facts) |

## Authentication

- **Reps/Admins:** Better Auth (email/password + OIDC plugin for Dex/Okta)
- **Widget:** Deployment-level API keys (one key per widget deployment)
