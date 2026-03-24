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
Layer 2:  agents, ingestion, ui          Domain logic & UI
Layer 1:  db, storage                    Infrastructure clients
Layer 0:  config, types                  Foundations
```

Higher layers import from lower layers. No circular dependencies. Turborepo enforces build order.

### Package Summary

| Package | Layer | Purpose |
|---------|-------|---------|
| `@typhoon/config` | 0 | Shared TypeScript, Biome, and env configs (Zod validation) |
| `@typhoon/types` | 0 | Zod schemas for domain entities |
| `@typhoon/db` | 1 | Drizzle ORM schemas + migrations (non-Mastra tables) |
| `@typhoon/storage` | 1 | S3/MinIO client (list, download, delete) |
| `@typhoon/agents` | 2 | Mastra supervisor + knowledge agent with RAG tools |
| `@typhoon/ingestion` | 2 | Document parsers, MDocument pipeline, BullMQ sync jobs |
| `@typhoon/ui` | 2 | Shared React component library (shadcn/ui) |

## Application Architecture

### API Server (`apps/server`)

- **Framework:** Mastra built-in Hono server
- **Auto-generated endpoints:** Agent generate/stream, memory threads/messages, working memory
- **Custom routes:** Sync targets CRUD, document browsing, feedback, widget chat, auth
- **Background workers:** BullMQ for S3 sync pipeline
- **Storage:** PostgresStore (threads, messages, memory) + PgVector (embeddings)

### Rep Workspace (`apps/desk`)

- **Build:** Vite + React 19
- **Routing:** TanStack Router
- **Server state:** TanStack Query
- **Chat:** CopilotKit headless (AG-UI protocol)
- **Pages:** Dashboard, Chat, Search, Documents

### Admin Dashboard (`apps/admin`)

- Same stack as desk (without CopilotKit)
- **Pages:** Dashboard, Sync Sources, Documents, Feedback

### Customer Widget (`apps/widget`)

- Embeddable `<script>` tag with CopilotKit popup
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
| SSE | Mastra `chatRoute` | Real-time chat streaming from agents |
| AG-UI | CopilotKit (SSE events) | Structured agent-UI protocol (tool calls, state) |
| Jobs | BullMQ (Redis) | Background document sync pipeline |

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
