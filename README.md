# Typhoon

AI-powered customer service chatbot that answers questions from source documents stored in S3/MinIO. Reps search and chat via a hybrid interface; customers interact through an embeddable widget. Built on Mastra for multi-agent orchestration, RAG, and memory.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.3.11 |
| Language | TypeScript 5.9 (strict) |
| Monorepo | Bun workspaces + Turborepo |
| Server | Mastra + Hono (`@mastra/hono`) |
| Agents / RAG / Memory | Mastra (`@mastra/core`, `@mastra/rag`, `@mastra/memory`) + `@typhoon/db` |
| Vectors | pgvector (PostgreSQL extension) |
| Background Jobs | BullMQ (Redis) |
| Auth | Better Auth + OIDC (Dex local / Okta prod) |
| Frontend | React 19 + Vite + TanStack Router/Query + Radix UI (shadcn-style) |
| Chat Streaming | AI SDK React (`@ai-sdk/react`) + Mastra `chatRoute` (SSE) |
| LLM Gateway | Bifrost (optional) |
| Observability | OpenTelemetry + Grafana LGTM (local) |
| Lint / Format | Biome v2 |
| Tests | Vitest |

## Prerequisites

- [Bun](https://bun.sh) 1.3.11+
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

## Quick Start

```bash
# 1. Clone and enter the project
cd typhoon

# 2. Bootstrap (installs deps, starts Docker, runs migrations)
bun run setup

# 3. Start all services
bun run dev

# 4. Open the apps
#    Admin:     http://localhost:5174
#    Rep desk:  http://localhost:5173
#    API:       http://localhost:5172
#    Widget:    http://localhost:5175

# 5. Log in via SSO (click "Sign in with SSO")
#    Admin: admin@typhoon.local / password
#    Rep:   rep@typhoon.local   / password

# 6. Open Grafana for observability
#    http://localhost:3000 (no login required)
```

## Project Structure

```
typhoon/
├── apps/
│   ├── api/             Mastra API server (Hono)
│   ├── worker/          BullMQ job consumer
│   ├── scheduler/       Cron job producer
│   ├── desk/            Rep workspace (search + chat)
│   ├── admin/           Admin dashboard
│   └── widget/          Embeddable customer chat widget
│
├── packages/
│   ├── config/   (L0)   Shared TS, Biome, env validation
│   ├── types/    (L0)   Zod schemas for domain entities
│   ├── db/       (L1)   Drizzle ORM schemas + migrations
│   ├── ai/       (L1)   LLM + embedding model factories
│   ├── storage/  (L1)   S3/MinIO client
│   ├── logger/   (L1)   Structured logging (Mastra logger)
│   ├── telemetry/(L1)   OpenTelemetry SDK, metrics, Hono middleware
│   ├── ingestion/(L2)   Document parsers + chunking + sync jobs
│   ├── agents/   (L2)   Mastra agent definitions + tools
│   ├── chat/     (L2)   React chat UI components (streaming, markdown)
│   └── ui/       (L2)   Shared React component library (Radix UI)
│
├── infra/docker/        Docker Compose + Bifrost/Dex configs
├── scripts/             dev-setup.sh, reset-dev.sh, docker.sh, seed-documents.sh
└── docs/                Project documentation
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run setup` | Bootstrap dev environment (install, Docker, migrations) |
| `bun run dev` | Start all services in dev mode |
| `bun run dev:api` | Start only the API server |
| `bun run dev:desk` | Start only the rep desk |
| `bun run dev:admin` | Start only the admin dashboard |
| `bun run dev:widget` | Start only the customer widget |
| `bun run dev:worker` | Start only the BullMQ worker |
| `bun run dev:backend` | Start API + worker + scheduler |
| `bun run doctor` | Check health of all services |
| `bun run build` | Build all packages and apps |
| `bun run test` | Run all tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run lint` | Lint with Biome |
| `bun run format` | Auto-fix lint/format issues |
| `bun run typecheck` | TypeScript type checking |
| `bun run db:migrate` | Run database migrations |
| `bun run seed:db` | Seed database with sample data |
| `bun run seed:docs` | Upload test documents to MinIO bucket |
| `bun run docker:up` | Start Docker services (build + detach) |
| `bun run docker:down` | Stop Docker services |
| `bun run docker:restart` | Restart Docker services (rebuild images) |
| `bun run docker:status` | Show running containers and health |
| `bun run docker:build` | Rebuild all Docker images (no cache) |
| `bun run docker:logs` | Tail logs from all services |
| `bun run reset` | Tear down and recreate dev environment |
| `bun run clean` | Remove build artifacts and node_modules |

## Documentation

- [Architecture](docs/architecture.md) — System design, layers, data stores
- [Getting Started](docs/getting-started.md) — Detailed setup and first steps
- [Environment Variables](docs/environment-variables.md) — Complete env var reference
- [Ingestion & RAG](docs/ingestion-and-rag.md) — Document pipeline and search
- [Infrastructure](docs/infrastructure.md) — Docker services and configuration
- [API Reference](docs/api-reference.md) — All HTTP endpoints
- [Design Proposal](docs/design.md) — Original design document
