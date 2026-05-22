# Typhoon -- Project Guidance

## Overview

Typhoon is an AI-powered customer service chatbot that answers questions from source documents stored in S3/MinIO. Built on Mastra for agents, RAG, and memory with a Bun/TypeScript monorepo.

**Full documentation:** `docs/README.md` (75+ files covering architecture, API, database, agents, ingestion, auth, evaluation, infrastructure, frontend, development).

## Stack

- **Runtime:** Bun 1.3.14
- **Language:** TypeScript 6.0+ (strict, ESNext/bundler, verbatimModuleSyntax)
- **Monorepo:** Bun workspaces + Turborepo
- **Lint/Format:** oxlint / oxfmt
- **Tests:** Vitest
- **Server:** Mastra + Hono (`@mastra/hono`)
- **Agents/RAG/Memory:** Mastra (@mastra/core, @mastra/rag, @mastra/memory) + @typhoon/db
- **Auth:** Better Auth (OIDC, RBAC, API keys)
- **Database:** PostgreSQL + pgvector (Drizzle ORM)
- **Jobs:** BullMQ via `RedisProvider` (`@typhoon/queue`)
- **Frontend:** React 19 + Vite + TanStack Router/Query + Radix UI + AI SDK React

## Quality Gates

Before marking work complete:

1. `bun run typecheck` -- zero TypeScript errors
2. `bun run check` -- zero lint/format/type errors
3. `bun run test` -- all unit tests passing
4. New/modified source files must have co-located `*.test.ts` with >=80% line coverage
5. If `packages/db` changed: `bun run test:integration`
6. If Drizzle schemas changed: `bun run db:generate` and include migration
7. Document changes: JSDoc on public functions, update `docs/` or READMEs as needed

If tests fail, attempt a fix at most twice. If still failing, stop and ask.

When a task is complete, provide concrete steps to test and verify (URLs, curl commands, UI flows). Skip for trivial changes.

## Commands

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `bun run test`             | Unit tests (vitest workspace)                              |
| `bun run test:watch`       | Unit tests in watch mode                                   |
| `bun run test:coverage`    | Unit tests with coverage                                   |
| `bun run test:integration` | Pg integration tests (needs `DATABASE_URL`)                |
| `bun run test:e2e`         | E2E via Playwright (needs full stack)                      |
| `bun run check`            | Format check + lint + typecheck                            |
| `bun run format`           | Auto-fix formatting with oxfmt                             |
| `bun run typecheck`        | TypeScript strict mode across all packages                 |
| `bun run docker:up`        | Start all Docker services                                  |
| `bun run docker:down`      | Stop all Docker services                                   |
| `bun run docker:restart`   | Stop + rebuild + start                                     |
| `bun run docker:status`    | Show running containers and health                         |
| `bun run doctor`           | Health check all services                                  |
| `bun run seed`             | Seed DB + upload sample documents                          |
| `bun run dev:api`          | Start API server only                                      |
| `bun run dev:desk`         | Start rep desk only                                        |
| `bun run dev:admin`        | Start admin dashboard only                                 |
| `bun run dev:widget`       | Start customer widget only                                 |
| `bun run dev:worker`       | Start BullMQ worker only                                   |
| `bun run dev:backend`      | Start API + worker + scheduler                             |
| `bun run setup`            | First-time dev setup                                       |
| `bun run reset`            | Tear down and re-setup from scratch                        |

Docker operations **must** use `bun run docker:*` or `./scripts/docker.sh` -- never raw `docker compose`.

## Working from the Claude Sandbox

Claude runs inside a Docker container. Set up port forwarding at the start of every session:

```bash
socat TCP-LISTEN:5172,fork,reuseaddr TCP:host.docker.internal:5172 &
socat TCP-LISTEN:5173,fork,reuseaddr TCP:host.docker.internal:5173 &
socat TCP-LISTEN:5174,fork,reuseaddr TCP:host.docker.internal:5174 &
socat TCP-LISTEN:5175,fork,reuseaddr TCP:host.docker.internal:5175 &
socat TCP-LISTEN:5432,fork,reuseaddr TCP:host.docker.internal:5432 &
socat TCP-LISTEN:5556,fork,reuseaddr TCP:host.docker.internal:5556 &
socat TCP-LISTEN:6379,fork,reuseaddr TCP:host.docker.internal:6379 &
socat TCP-LISTEN:9000,fork,reuseaddr TCP:host.docker.internal:9000 &
```

**Dev credentials:** `admin@typhoon.local` / `password` (admin), `rep@typhoon.local` / `password` (rep) via Dex OIDC. Email/password login is disabled -- SSO only.

**Playwright:** Ensure port forwarding is active, use headless mode, close the MCP browser before running `bun run test:e2e`.

## Architecture

**Backend:** Route -> Service -> Repository

- **Routes** (`apps/api/src/routes/`) -- HTTP only. No Drizzle imports. Use `errorResponse()` for errors.
- **Services** (`packages/services/src/`) -- Business logic. Constructor DI. Returns `Result<T>`. No exceptions.
- **Repos** (`packages/db/src/repos/`) -- Data access only. Drizzle queries. No service/HTTP imports.
- **Composition roots** (`apps/*/src/services.ts`) -- Wire repos + services per app.

**Frontend:** Page -> Feature Hook -> API Client

- **Pages** (`apps/*/src/components/pages/`) -- Composition + layout
- **Feature Hooks** (`apps/*/src/features/`) -- Mutations + cache invalidation
- **API Client** (`packages/api-client/src/`) -- Typed API calls + TanStack Query factories

See `docs/architecture/` for detailed diagrams and the layered dependency model.

## Key Conventions

- **Environment:** Never read `process.env` directly -- use `@typhoon/config` Zod schemas
- **File naming:** kebab-case for files, PascalCase for React components
- **Imports:** Extensionless (`from './foo'` not `from './foo.js'`)
- **Navigation:** TanStack Router `<Link>` -- never plain `<a href>`
- **Entity creation:** Dedicated pages, not dialogs
- **BullMQ:** All queue/worker objects via `RedisProvider` -- never construct directly
- **Query keys:** Always use `queryKeys` from `@typhoon/api-client` -- ad-hoc arrays break SSE invalidation
- **Logging:** `createAppLogger('module-name')` from `@typhoon/logger`
- **Lint suppressions:** Fix the issue instead. Only suppress as a last resort with explanation.

## Detailed Documentation

| Topic                    | Location                                                     |
| ------------------------ | ------------------------------------------------------------ |
| Architecture & layers    | `docs/architecture/`                                         |
| API endpoints            | `docs/api-reference/`                                        |
| Database schema          | `docs/database/schema-reference.md`                          |
| Agents & RAG             | `docs/agents-and-rag/`                                       |
| Ingestion pipeline       | `docs/ingestion/`                                            |
| Auth & RBAC              | `docs/auth/`                                                 |
| Evaluation & scoring     | `docs/evaluation/`                                           |
| Docker & infrastructure  | `docs/infrastructure/`                                       |
| Environment variables    | `docs/infrastructure/environment-variables.md`               |
| Frontend patterns        | `docs/frontend/`                                             |
| Chat & streaming         | `docs/frontend/chat-streaming.md`                            |
| Testing & mocking        | `docs/development/testing.md`                                |
| Quality gates            | `docs/development/quality-gates.md`                          |
| Linting & formatting     | `docs/development/linting-formatting.md`                     |
| Scripts reference        | `docs/development/scripts.md`                                |
| Metadata & search        | `docs/agents-and-rag/metadata-filtering.md`                  |

## Maintaining This File

Only add to this file if the information is:

1. **Useful for future sessions** -- it prevents repeating a mistake or saves meaningful time
2. **Persistent** -- it reflects an ongoing constraint or convention, not a one-time fix

Detailed implementation specifics belong in `docs/` or package READMEs, not here.
