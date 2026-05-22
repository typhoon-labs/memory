# @typhoon/api

HTTP API server for Typhoon. Serves all REST and SSE endpoints, Mastra agents, authentication, and queue administration. Acts as the single ingress point for all three frontend apps (admin dashboard, rep desk, customer widget) and external API consumers.

## Architecture Context

The API server is the central hub of the Typhoon system. It sits between the frontends and the backend services, coordinating document management, AI chat, search, queue administration, and authentication. It does not process background jobs directly -- instead, it enqueues work onto BullMQ queues consumed by `@typhoon/worker`.

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph LR
  Admin[Admin Dashboard<br/>:5174] --> API
  Desk[Rep Desk<br/>:5173] --> API
  Widget[Customer Widget<br/>:5175] --> API

  API["@typhoon/api<br/>:5172"]

  API --> PG[(PostgreSQL<br/>+ pgvector)]
  API --> Redis[(Redis)]
  API --> MinIO[(MinIO / S3)]
  API --> Mastra[Mastra<br/>Supervisor Agent]

  Redis --> Worker["@typhoon/worker"]
  Redis --> Scheduler["@typhoon/scheduler"]
```

The API follows the **Route -> Service -> Repository** layered architecture. Routes handle HTTP concerns (parsing, validation, response formatting), services contain business logic, and repositories encapsulate all database access.

See also: [Architecture overview](../../docs/architecture.md), [API reference](../../docs/api-reference.md)

## Running

```bash
bun run dev       # Development server with --watch
bun run start     # Production mode
```

Default: `http://localhost:5172`

## Internal Structure

```
src/
  index.ts                    Entry point: Hono app, Bun.serve, bootstrap, shutdown
  services.ts                 Composition root: wires repos + services (lazy singletons)
  mastra/
    index.ts                  Mastra instance: agents, memory, storage, route registration
  config/
    sources.ts                Credential source registration (S3/MinIO)
    sync-targets.ts           Code-defined sync target registration
  infra/
    auth.ts                   Better Auth configuration (OIDC, API keys, Redis sessions)
    db.ts                     PostgreSQL connection (Drizzle + postgres.js)
    queue.ts                  BullMQ queue registry, event bus, OTel metrics, shutdown
    init.ts                   Startup: vector index init, sync target DB reconciliation
    failed-job-archiver.ts    Persists terminal job failures to PostgreSQL
  lib/
    cache.ts                  In-memory TTL cache (dashboard API responses)
    error-response.ts         Maps service Result errors to HTTP status codes
  middleware/
    request-logger.ts         HTTP request logging (debug/warn/error by status)
    require-auth.ts           Session/API key authentication check
    require-admin.ts          Admin role authorization (requires requireAuth first)
  routes/
    auth.ts                   Better Auth passthrough (/v1/auth/*)
    chat.ts                   AI chat streaming (Mastra + AI SDK v6)
    search.ts                 Hybrid and vector document search
    documents.ts              Document CRUD, chunks, retry, resync, bulk ops
    sync-targets.ts           Sync target CRUD, trigger sync, upload, browse, folders
    queues.ts                 Queue admin, SSE event stream, job management
    threads.ts                Conversation thread CRUD
    feedback.ts               User feedback (thumbs up/down + comments)
    reviews.ts                Admin review queue: thread scoring, annotations
    scorers.ts                Scorer definition CRUD, versioning, preview
    datasets.ts               Evaluation dataset CRUD + items
    experiments.ts            Experiment CRUD, run, compare results
    dashboard.ts              Admin dashboard: score/latency/cost time-series
    traces.ts                 OTel trace viewer (list, detail)
    metadata-field-groups.ts  Metadata field group CRUD
    metadata-templates.ts     Metadata template CRUD
    widget.ts                 Customer widget config + chat endpoint
```

## Startup Sequence (Bootstrap)

On startup, `index.ts` executes the following in order:

1. **OpenTelemetry instrumentation** -- imported before all other modules
2. **Hono app creation** -- with OTel middleware and request logger applied globally
3. **MastraServer initialization** -- wires agents and all API routes into Hono
4. **URL rewrite middleware** -- `/api/v1/*` -> `/v1/*` with SSE idle timeout bypass
5. **Source and sync target registration** -- reads env vars, validates config
6. **Vector index initialization** -- creates/ensures the `knowledge_base` HNSW index in pgvector; backfills tsvector columns for hybrid search
7. **Sync target reconciliation** -- upserts config-defined targets to DB, deactivates orphans
8. **Queue initialization** -- creates 5 BullMQ queues: `sync`, `reports`, `scoring`, `reviews`, `experiments`
9. **Failed job archiver** -- subscribes to sync queue `failed` events, persists to PostgreSQL
10. **Reviews queue wiring** -- passes the reviews queue to ChatService for scoring job enqueue

## Composition Root (services.ts)

The composition root lazily instantiates and caches service singletons. Each service receives its dependencies (repos, queues, vector store) via constructor injection.

| Service             | Dependencies                                                       | Purpose                                       |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `DocumentService`   | documentRepo, syncTargetRepo, metadataRepo, vectorStore, syncQueue | Document lifecycle, chunk retrieval, metadata |
| `FeedbackService`   | feedbackRepo, messageRepo, threadRepo                              | User feedback collection                      |
| `MetadataService`   | metadataRepo, syncTargetRepo                                       | Field groups + templates CRUD                 |
| `SyncTargetService` | syncTargetRepo, syncJobRepo, documentRepo, vectorStore, syncQueue  | Sync target lifecycle, file operations        |
| `ReviewService`     | reviewRepo, vectorStore                                            | Thread review, human annotations              |
| `ScoringService`    | messageRepo, threadRepo, scoreRepo, vectorStore                    | Score retrieval and persistence               |
| `ThreadService`     | threadRepo, messageRepo, vectorStore                               | Thread CRUD                                   |
| `ScorerService`     | scorerStorage (Drizzle), scorerRepo                                | Scorer definitions + versions                 |
| `DatasetService`    | datasetsStorage (Drizzle)                                          | Evaluation datasets                           |
| `ExperimentService` | experimentsStorage, datasetsStorage, experimentQueue               | Experiment runs                               |
| `DashboardService`  | dashboardRepo                                                      | Admin analytics aggregations                  |
| `TraceService`      | traceRepo                                                          | OTel trace querying                           |
| `SearchService`     | vectorStore, embedder, reranker                                    | Hybrid/vector search with reranking           |
| `ChatService`       | isScoringEnabled, sampleRate                                       | Chat orchestration, scoring enqueue           |
| `QueueService`      | getAllQueues, getQueue, failedJobRepo                              | Queue admin operations                        |

## Mastra Integration

The Mastra instance (`src/mastra/index.ts`) is the heart of the AI functionality:

- **Supervisor agent** -- created via `createSupervisor()` from `@typhoon/agents`, handles all chat conversations
- **Memory** -- `@mastra/memory` backed by PostgresStore + PgVector, configured with 20 last messages and no semantic recall/working memory
- **Metadata context** -- a 60-second TTL cache that queries available metadata field values from the DB and injects them into the knowledge agent's prompt for filtered search
- **Guardrails** -- configurable via env vars: prompt injection, moderation, PII detection, system prompt scrubbing
- **Observability** -- OpenTelemetry traces for all agent operations
- **Route registration** -- all API route arrays are registered via `server.apiRoutes`
- **CORS** -- allows credentials from `localhost:5173` (desk) and `localhost:5174` (admin)

## Middleware Stack

All requests pass through these global middleware in order:

1. **OTel middleware** (`@typhoon/telemetry`) -- creates spans for every request
2. **Request logger** -- logs method, path, status, duration; level varies by status code (debug < 400, warn 4xx, error 5xx)

Per-route middleware applied via `middleware: [...]` on `registerApiRoute`:

3. **requireAuth** -- validates session cookie or API key via Better Auth; sets `user` and `session` on Hono context
4. **requireAdmin** -- checks `user.role === 'admin'`; must follow `requireAuth`

## SSE Patterns

Two distinct SSE streaming patterns are used:

### Queue Events (`/v1/queues/events`)

Uses Hono `streamSSE()` to push BullMQ job state changes (waiting, active, completed, failed, removed, progress, stalled) to the admin UI. The server-side event bus (`queueEventBus`) is an `EventEmitter` with max 100 listeners. Features:

- Heartbeat every 30 seconds to keep reverse proxies alive (nginx 300s read timeout)
- Browser reconnect hint via SSE `retry: 5000`
- Cleanup on client disconnect via `stream.onAbort()`

### Chat Streaming (`/v1/chat/:agentId`)

Uses AI SDK v6 `handleChatStream()` + `createUIMessageStreamResponse()` for streaming agent responses. The stream includes tool calls, sources, and step/finish/error events. On completion, enqueues a scoring job if scoring is enabled.

### Bun Idle Timeout Handling

Bun defaults `idleTimeout` to 10 seconds, which would kill SSE streams. The server:

- Sets a global `idleTimeout: 30` in `Bun.serve()` config
- The `/api/v1/*` rewrite detects `Accept: text/event-stream` and calls `server.timeout(req, 0)` to disable the timeout entirely for SSE streams
- This must happen on the **original** `Request` object before the URL rewrite creates a new one

## Route Groups

### Public Routes

| Method | Path                | Description                                    |
| ------ | ------------------- | ---------------------------------------------- |
| ALL    | `/v1/auth/*`        | Better Auth handler (OIDC, sessions, API keys) |
| GET    | `/v1/widget/config` | Widget configuration (name, welcome message)   |
| POST   | `/v1/widget/chat`   | Widget chat (AG-UI protocol, no auth)          |

### Authenticated Routes (requireAuth)

| Method                | Path                                  | Description                                 |
| --------------------- | ------------------------------------- | ------------------------------------------- |
| POST                  | `/v1/chat/:agentId`                   | AI chat streaming                           |
| POST                  | `/v1/search/hybrid`                   | Hybrid search (vector + full-text + rerank) |
| POST                  | `/v1/search`                          | Vector-only search                          |
| GET                   | `/v1/documents`                       | List documents (optional `?syncTargetId`)   |
| GET                   | `/v1/documents/:id`                   | Document detail                             |
| GET                   | `/v1/documents/:id/chunks`            | Document vector chunks                      |
| GET                   | `/v1/documents/:id/parsed-content`    | Parsed text (ETag/304 support)              |
| GET                   | `/v1/documents/:id/download`          | Raw file download                           |
| POST                  | `/v1/documents/:id/retry`             | Retry failed document                       |
| POST                  | `/v1/documents/:id/resync`            | Force re-sync document                      |
| PATCH                 | `/v1/documents/:id`                   | Update document metadata                    |
| DELETE                | `/v1/documents/:id`                   | Delete document                             |
| POST                  | `/v1/documents/bulk-metadata`         | Bulk metadata update (up to 100)            |
| POST                  | `/v1/documents/bulk-delete`           | Bulk delete (up to 100)                     |
| GET                   | `/v1/documents/metadata-fields`       | Available metadata fields                   |
| POST                  | `/v1/documents/:id/move`              | Move document (S3 only)                     |
| GET/POST/PATCH/DELETE | `/v1/sync-targets[/:id]`              | Sync target CRUD                            |
| POST                  | `/v1/sync-targets/:id/sync`           | Trigger sync (optional `force`)             |
| POST                  | `/v1/sync-targets/:id/cancel`         | Cancel running sync                         |
| POST                  | `/v1/sync-targets/:id/purge`          | Purge all documents                         |
| GET                   | `/v1/sync-targets/:id/jobs`           | List sync jobs                              |
| POST                  | `/v1/sync-targets/:id/upload`         | Upload files (multipart, S3 only)           |
| GET                   | `/v1/sync-targets/:id/browse`         | Browse files at prefix                      |
| POST                  | `/v1/sync-targets/:id/folders`        | Create folder                               |
| POST                  | `/v1/sync-targets/:id/folders/delete` | Delete folder + contents                    |
| POST                  | `/v1/sync-targets/:id/folders/move`   | Move/rename folder                          |
| GET                   | `/v1/sources`                         | List registered credential sources          |
| GET/POST/PATCH/DELETE | `/v1/metadata-field-groups[/:id]`     | Metadata field group CRUD                   |
| GET/POST/PATCH/DELETE | `/v1/metadata-templates[/:id]`        | Metadata template CRUD                      |
| GET/POST              | `/v1/threads[/:threadId]`             | Thread CRUD (user-scoped)                   |
| PATCH/DELETE          | `/v1/threads/:threadId`               | Update/delete thread                        |
| POST/GET              | `/v1/feedback`                        | Feedback upsert/list                        |
| GET                   | `/v1/queues`                          | List queues with job counts                 |
| GET                   | `/v1/queues/events`                   | SSE stream of queue events                  |
| GET                   | `/v1/queues/:name/workers`            | List connected workers                      |
| GET                   | `/v1/queues/:name/jobs`               | List jobs by state                          |
| POST                  | `/v1/queues/:name/pause`              | Pause queue                                 |
| POST                  | `/v1/queues/:name/resume`             | Resume queue                                |
| POST                  | `/v1/queues/:name/clean`              | Clean old jobs                              |
| POST                  | `/v1/queues/:name/jobs/:jobId/retry`  | Retry failed job                            |
| DELETE                | `/v1/queues/:name/jobs/:jobId`        | Remove job                                  |
| GET                   | `/v1/queues/failed-jobs`              | List archived failed jobs                   |
| GET/DELETE            | `/v1/queues/failed-jobs/:id`          | Get/delete archived failed job              |

### Admin Routes (requireAuth + requireAdmin)

| Method                | Path                                                       | Description                      |
| --------------------- | ---------------------------------------------------------- | -------------------------------- |
| GET                   | `/v1/admin/reviews`                                        | List threads for review          |
| GET                   | `/v1/admin/reviews/:threadId`                              | Thread detail with scores        |
| POST                  | `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | Create annotation                |
| PATCH                 | `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | Update annotation                |
| DELETE                | `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | Delete annotation                |
| GET/POST/PATCH/DELETE | `/v1/admin/scorers[/:id]`                                  | Scorer CRUD                      |
| GET                   | `/v1/admin/scorers/models`                                 | Available scorer models          |
| GET/POST              | `/v1/admin/scorers/:id/versions`                           | Scorer version management        |
| POST                  | `/v1/admin/scorers/:id/publish`                            | Publish scorer version           |
| POST                  | `/v1/admin/scorers/:id/preview`                            | Test scorer against sample data  |
| GET/POST/PATCH/DELETE | `/v1/admin/datasets[/:id]`                                 | Dataset CRUD                     |
| GET/POST              | `/v1/admin/datasets/:id/items[/:itemId]`                   | Dataset item management          |
| PATCH/DELETE          | `/v1/admin/datasets/:id/items/:itemId`                     | Update/delete item               |
| GET/POST/DELETE       | `/v1/admin/experiments[/:id]`                              | Experiment CRUD                  |
| GET                   | `/v1/admin/experiments/compare`                            | Compare two experiments          |
| GET                   | `/v1/admin/experiments/:id/results`                        | Experiment results               |
| GET                   | `/v1/admin/dashboard/scores`                               | Score time-series                |
| GET                   | `/v1/admin/dashboard/threads`                              | Worst-performing threads         |
| GET                   | `/v1/admin/dashboard/users`                                | Per-user quality metrics         |
| GET                   | `/v1/admin/dashboard/latency`                              | Latency time-series              |
| GET                   | `/v1/admin/dashboard/cost`                                 | Cost time-series                 |
| GET                   | `/v1/admin/dashboard/documents`                            | Document analytics (placeholder) |
| GET                   | `/v1/admin/traces`                                         | List OTel traces                 |
| GET                   | `/v1/admin/traces/:traceId`                                | Trace detail with spans          |

## Authentication

Authentication is handled by Better Auth (`src/infra/auth.ts`):

- **Session storage** -- PostgreSQL (via Drizzle adapter) + Redis secondary storage for cookie cache (5-minute TTL)
- **OIDC** -- Generic OAuth provider (Dex in dev). Maps IdP groups to app roles (`admin`, `rep`) via `ADMIN_ROLES` / `REP_ROLES` env vars
- **API keys** -- `@better-auth/api-key` plugin, validated via `X-API-Key` header
- **Admin plugin** -- Default role is `rep`; admin roles defined by `APP_ROLES.ADMIN`
- **Security** -- HTML error pages from Better Auth are suppressed to avoid stack disclosure

## Configuration

### Environment Variables

| Variable                            | Default                                       | Description                                  |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------- |
| `PORT`                              | `5172`                                        | HTTP server port                             |
| `HOST`                              | `0.0.0.0`                                     | Bind address                                 |
| `DATABASE_URL`                      | `postgresql://typhoon:typhoon@localhost:5432/typhoon`  | PostgreSQL connection string                 |
| `REDIS_URL`                         | `redis://localhost:6379`                      | Redis connection (BullMQ + session cache)    |
| `AUTH_SECRET`                       | (none)                                        | Better Auth secret key                       |
| `AUTH_URL`                          | `http://localhost:5172`                       | Better Auth base URL                         |
| `TRUSTED_ORIGINS`                   | `http://localhost:5173,http://localhost:5174` | CORS allowed origins                         |
| `OIDC_ISSUER_URL`                   | (none)                                        | OIDC provider issuer URL                     |
| `OIDC_CLIENT_ID`                    | (none)                                        | OIDC client ID                               |
| `OIDC_CLIENT_SECRET`                | (none)                                        | OIDC client secret                           |
| `OIDC_BACKCHANNEL_URL`              | (same as issuer)                              | Server-to-IdP URL (differs in Docker)        |
| `ADMIN_ROLES`                       | `admin`                                       | Comma-separated IdP groups that map to admin |
| `REP_ROLES`                         | `rep`                                         | Comma-separated IdP groups that map to rep   |
| `S3_ENDPOINT`                       | `http://localhost:9000`                       | S3/MinIO endpoint                            |
| `S3_REGION`                         | `us-east-1`                                   | S3 region                                    |
| `S3_ACCESS_KEY`                     | (empty)                                       | S3 access key                                |
| `S3_SECRET_KEY`                     | (empty)                                       | S3 secret key                                |
| `TYPHOON_DOCS_BUCKET`                  | `typhoon-documents`                              | Default document bucket                      |
| `TYPHOON_DOCS_PREFIX`                  | (empty)                                       | Key prefix within bucket                     |
| `TYPHOON_DOCS_CRON`                    | `0 */6 * * *`                                 | Default sync schedule (every 6 hours)        |
| `SCORING_SAMPLE_RATE`               | `1.0`                                         | Fraction of chats to score (0.0-1.0)         |
| `GUARDRAIL_PROMPT_INJECTION`        | `false`                                       | Enable prompt injection guardrail            |
| `GUARDRAIL_MODERATION`              | `false`                                       | Enable moderation guardrail                  |
| `GUARDRAIL_PII_DETECTION`           | `false`                                       | Enable PII detection guardrail               |
| `GUARDRAIL_SYSTEM_PROMPT_SCRUBBING` | `true`                                        | Enable system prompt scrubbing               |
| `LOG_LEVEL`                         | `info`                                        | Logging verbosity                            |

See also: [Full environment variable reference](../../docs/environment-variables.md)

## Bun Server Configuration

The `Bun.serve()` export configures:

- **Port** -- `PORT` env var, default 5172
- **Hostname** -- `HOST` env var, default `0.0.0.0`
- **idleTimeout** -- 30 seconds global ceiling (default Bun is 10s); SSE streams opt out individually via `server.timeout(req, 0)`
- **fetch handler** -- captures the `Bun.Server` reference on first call for SSE timeout management

## Graceful Shutdown

On `SIGTERM` or `SIGINT`:

1. Closes all BullMQ QueueEvents listeners
2. Closes all BullMQ Queue instances (via registry shutdown)
3. Exits the process

Active HTTP connections are handled by Bun's built-in drain behavior.

## Scaling and Operations

- The API server is **stateless** (sessions in Redis, data in PostgreSQL) and can be horizontally scaled behind a load balancer
- The in-memory dashboard cache and metadata context cache are per-instance; stale reads are acceptable (60s TTL)
- The queue event SSE bus (`queueEventBus`) is per-instance with max 100 listeners -- scale admin dashboard connections accordingly
- BullMQ queues are initialized once on startup; multiple API replicas can enqueue to the same Redis instance
- OTel metrics (job completed/failed/stalled counters, queue depth gauge, job duration histogram) are exported from each replica

## Dependencies

| Package                                                                           | Purpose                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| `@mastra/core`, `@mastra/hono`, `@mastra/memory`, `@mastra/rag`, `@mastra/ai-sdk` | Agent framework, HTTP integration, RAG     |
| `@typhoon/agents`, `@typhoon/ai`                                                        | Supervisor agent, embedding/scoring models |
| `@typhoon/db`, `@typhoon/services`                                                      | Database layer, business logic             |
| `@typhoon/ingestion`                                                                 | Source/sync-target registration            |
| `@typhoon/config`, `@typhoon/types`                                                     | Shared configuration, type definitions     |
| `@typhoon/queue`                                                                     | BullMQ queue registry                      |
| `@typhoon/telemetry`                                                                 | OpenTelemetry instrumentation + metrics    |
| `@typhoon/logger`                                                                    | Structured logging                         |
| `better-auth`, `@better-auth/api-key`, `@better-auth/redis-storage`               | Authentication                             |
| `hono`                                                                            | HTTP framework                             |
| `bullmq`, `ioredis`                                                               | Job queues, Redis                          |
| `ai`                                                                              | AI SDK (embeddings, streaming)             |
| `drizzle-orm`, `postgres`                                                         | Database ORM + driver                      |
| `zod`                                                                             | Request validation                         |
