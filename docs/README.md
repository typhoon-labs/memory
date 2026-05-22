# Typhoon Documentation

Typhoon is an AI-powered customer service chatbot that answers questions from source documents stored in S3/MinIO. Built on Mastra for agents, RAG, and memory with a Bun/TypeScript monorepo.

## Getting Started

- [Setup and First Run](getting-started/README.md) -- prerequisites, installation, dev server
- [Prerequisites](getting-started/prerequisites.md) -- Bun, Docker, OS requirements
- [Dev Credentials](getting-started/dev-credentials.md) -- OIDC users, MinIO, Grafana, API keys
- [Troubleshooting](getting-started/troubleshooting.md) -- common issues and fixes

## Architecture

- [System Overview](architecture/README.md) -- high-level design, component diagram
- [Data Flow](architecture/data-flow.md) -- end-to-end: document ingestion through chat response
- [Layered Architecture](architecture/layered-architecture.md) -- Route, Service, Repo pattern
- [Package Dependency Model](architecture/package-dependency-model.md) -- 3-layer model
- [Agent Architecture](architecture/agent-architecture.md) -- supervisor, knowledge agent, tools

## API Reference

- [Overview](api-reference/README.md) -- base URL, authentication, errors, pagination
- [Auth Endpoints](api-reference/auth-endpoints.md) -- Better Auth + Mastra auto-generated
- [Chat](api-reference/chat.md) -- streaming chat with agents (SSE)
- [Threads](api-reference/threads.md) -- conversation CRUD
- [Search](api-reference/search.md) -- hybrid and vector search
- [Sync Targets](api-reference/sync-targets.md) -- source management, sync, upload, browse
- [Documents](api-reference/documents.md) -- document CRUD, bulk ops, chunks
- [Feedback](api-reference/feedback.md) -- user ratings
- [Queues](api-reference/queues.md) -- job queue management, SSE events
- [Widget](api-reference/widget.md) -- embeddable widget config and chat
- [Dashboard](api-reference/dashboard.md) -- analytics endpoints
- [Reviews](api-reference/reviews.md) -- thread reviews, annotations
- [Datasets](api-reference/datasets.md) -- evaluation datasets
- [Experiments](api-reference/experiments.md) -- A/B experiments
- [Scorers](api-reference/scorers.md) -- scorer definitions and versions
- [Traces](api-reference/traces.md) -- distributed tracing
- [Metadata](api-reference/metadata.md) -- field groups and templates

## Database

- [Overview](database/README.md) -- PostgreSQL + pgvector, dual-store model
- [Schema Reference](database/schema-reference.md) -- all tables, columns, indexes
- [Migrations](database/migrations.md) -- Drizzle migration workflow
- [Query Patterns](database/patterns.md) -- Drizzle conventions, JSONB, repos

## Agents and RAG

- [Overview](agents-and-rag/README.md) -- agent system and RAG pipeline
- [Supervisor Agent](agents-and-rag/supervisor.md) -- routing, error handling
- [Knowledge Agent](agents-and-rag/knowledge-agent.md) -- search delegation, metadata context
- [Search Tools](agents-and-rag/search-tools.md) -- vector, hybrid, graph tools
- [Retrieval Pipeline](agents-and-rag/retrieval-pipeline.md) -- reranking, dedup, RRF
- [Citations](agents-and-rag/citations.md) -- generation, storage, hydration
- [Metadata Filtering](agents-and-rag/metadata-filtering.md) -- dynamic context, auto-extraction
- [Guardrails](agents-and-rag/guardrails.md) -- prompt injection, moderation, PII
- [Memory](agents-and-rag/memory.md) -- Mastra memory system

## Ingestion

- [Overview](ingestion/README.md) -- document processing pipeline
- [Sync Pipeline](ingestion/sync-pipeline.md) -- S3 scan, change detection, BullMQ jobs
- [Parsers](ingestion/parsers.md) -- PDF, DOCX, XLSX, HTML, Markdown, JSON
- [Chunking](ingestion/chunking.md) -- format-aware strategies
- [Metadata Extraction](ingestion/metadata-extraction.md) -- LLM-powered extraction
- [Embedding](ingestion/embedding.md) -- adaptive ratio, retry, batching
- [Vector Storage](ingestion/vector-storage.md) -- pgvector upsert, metadata layout

## Authentication

- [Overview](auth/README.md) -- Better Auth + OIDC + API keys
- [OIDC Flow](auth/oidc-flow.md) -- Dex (dev), Okta (prod), group-to-role mapping
- [RBAC](auth/rbac.md) -- roles, middleware, route requirements
- [API Keys](auth/api-keys.md) -- widget authentication
- [Session Management](auth/session-management.md) -- Redis, cookies, CORS

## Evaluation

- [Overview](evaluation/README.md) -- scoring, reviews, experiments
- [Scorers](evaluation/scorers.md) -- built-in and custom scorers
- [Reviews](evaluation/reviews.md) -- automated review pipeline
- [Experiments](evaluation/experiments.md) -- experiment lifecycle
- [Datasets](evaluation/datasets.md) -- evaluation datasets
- [Annotations](evaluation/annotations.md) -- human annotation workflow

## Infrastructure

- [Overview](infrastructure/README.md) -- Docker services, scripts
- [Docker Services](infrastructure/docker-services.md) -- all services, profiles, volumes
- [Observability](infrastructure/observability.md) -- OpenTelemetry, Grafana, dashboards
- [Environment Variables](infrastructure/environment-variables.md) -- complete reference
- [Production Deployment](infrastructure/production.md) -- K8s, scaling, external services

## Frontend

- [Overview](frontend/README.md) -- React 19, Vite, TanStack, Radix UI
- [Routing](frontend/routing.md) -- TanStack Router, deep linking
- [State Management](frontend/state-management.md) -- TanStack Query patterns
- [UI Patterns](frontend/ui-patterns.md) -- CVA, page layout, component conventions
- [Chat Streaming](frontend/chat-streaming.md) -- AI SDK, SSE, stall detection

## Development

- [Overview](development/README.md) -- workflow, tools, contributing
- [Testing](development/testing.md) -- Vitest, coverage, mocking patterns
- [Linting and Formatting](development/linting-formatting.md) -- oxlint, oxfmt, lefthook
- [Quality Gates](development/quality-gates.md) -- pre-merge checklist
- [Conventions](development/conventions.md) -- naming, imports, TypeScript style
- [Scripts](development/scripts.md) -- all project scripts

## Packages

Each package has a comprehensive README in its directory.

| Package                                              | Layer | Purpose                                            |
| ---------------------------------------------------- | ----- | -------------------------------------------------- |
| [@typhoon/config](../packages/config/README.md)         | 0     | Shared TypeScript and env configs (Zod validation) |
| [@typhoon/types](../packages/types/README.md)           | 0     | Zod schemas for domain entities                    |
| [@typhoon/db](../packages/db/README.md)                 | 1     | Drizzle ORM schemas, migrations, repositories      |
| [@typhoon/ai](../packages/ai/README.md)                 | 1     | LLM + embedding model factories                    |
| [@typhoon/blob-store](../packages/blob-store/README.md) | 1     | Interface-based blob storage (S3/MinIO)            |
| [@typhoon/logger](../packages/logger/README.md)         | 1     | Structured logging via Mastra logger               |
| [@typhoon/telemetry](../packages/telemetry/README.md)   | 1     | OpenTelemetry SDK, metrics, Hono middleware        |
| [@typhoon/queue](../packages/queue/README.md)           | 1     | BullMQ job queue wrapper                           |
| [@typhoon/agents](../packages/agents/README.md)         | 2     | Mastra supervisor + knowledge agent with RAG tools |
| [@typhoon/ingestion](../packages/ingestion/README.md)   | 2     | Document parsers, MDocument pipeline, sync jobs    |
| [@typhoon/evals](../packages/evals/README.md)           | 2     | Scorer categories, scoring/experiment job handlers |
| [@typhoon/services](../packages/services/README.md)     | 2     | Business logic services (13 services)              |
| [@typhoon/api-client](../packages/api-client/README.md) | 2     | Typed API client + TanStack Query factories        |
| [@typhoon/chat](../packages/chat/README.md)             | 2     | React chat UI components                           |
| [@typhoon/ui](../packages/ui/README.md)                 | 2     | Shared React component library (Radix/shadcn)      |

## Apps

Each app has a comprehensive README in its directory.

| App                                            | Port | Purpose                                  |
| ---------------------------------------------- | ---- | ---------------------------------------- |
| [@typhoon/api](../apps/api/README.md)             | 5172 | HTTP API server (Mastra + Hono)          |
| [@typhoon/worker](../apps/worker/README.md)       | 5170 | BullMQ job consumer (4 worker pools)     |
| [@typhoon/scheduler](../apps/scheduler/README.md) | 5171 | Cron sync scheduler                      |
| [@typhoon/admin](../apps/admin/README.md)         | 5174 | Admin dashboard (React)                  |
| [@typhoon/desk](../apps/desk/README.md)           | 5173 | Rep workspace with chat + search (React) |
| [@typhoon/widget](../apps/widget/README.md)       | 5175 | Embeddable customer chat widget (React)  |

## Historical

- [Original Design Proposal](design.md) -- initial system design document
