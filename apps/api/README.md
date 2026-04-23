# @typhoon/api

HTTP API server for Typhoon. Serves all REST and SSE endpoints, Mastra agents, authentication, and queue administration.

## Running

```bash
bun run dev   # Development server with --watch
```

Default: `http://localhost:5172`

## Responsibilities

- All HTTP routes (chat, search, documents, sync targets, feedback, threads, auth)
- Mastra supervisor + knowledge agent (SSE streaming)
- BullMQ job enqueuing (sync scans, file processing)
- Queue admin endpoints and SSE event stream
- Better Auth (email/password, OIDC, API keys)
- Source and sync target registration + DB reconciliation
- Vector index initialization

## Key Routes

| Prefix | Description |
|--------|-------------|
| `/v1/chat` | Streaming AI chat via Mastra agent |
| `/v1/search` | Hybrid/semantic document search |
| `/v1/documents` | Document listing and chunk retrieval |
| `/v1/sync-targets` | Sync target CRUD, trigger sync, upload, browse |
| `/v1/queues` | Queue admin, SSE events, job management |
| `/v1/threads` | Conversation thread management |
| `/v1/feedback` | User feedback collection |
| `/v1/auth/*` | Authentication (Better Auth) |

## Dependencies

`@typhoon/agents`, `@typhoon/ai`, `@typhoon/db`, `@typhoon/ingestion`, `@typhoon/storage`, `@typhoon/ui` (type-only for auth), Mastra, Hono, BullMQ, Better Auth
