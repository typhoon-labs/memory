# API Reference

## Base URL

```
http://localhost:5172
```

## Versioning

All custom routes are prefixed with `/v1`. Mastra auto-generated routes use the `/api` prefix (no version).

## Authentication

Every custom route requires authentication unless explicitly marked otherwise. Two authentication methods are supported:

1. **Session cookie** -- Obtained via the OIDC sign-in flow through Better Auth. The cookie is set automatically after completing the `/v1/auth/sign-in/social` redirect chain.

2. **API key** -- Pass the key in the `X-API-Key` header. API keys are created by authenticated admins through the Better Auth API key endpoints.

Admin routes (`/v1/admin/*`) require both `requireAuth` and `requireAdmin` middleware. Metadata routes (`/v1/metadata-*`) require only `requireAuth`.

## Error Responses

All error responses follow a consistent shape produced by the `errorResponse()` helper:

```json
{
  "error": "Human-readable error message",
  "details": {}
}
```

The `details` field is optional and included only when additional context is available (e.g., Zod validation issues). Common HTTP status codes:

| Status | Meaning                                  |
| ------ | ---------------------------------------- |
| 400    | Validation error or invalid request      |
| 403    | Forbidden (insufficient permissions)     |
| 404    | Resource not found                       |
| 409    | Conflict (duplicate, already processing) |
| 500    | Internal server error                    |

## Pagination

Paginated endpoints accept `page` and `perPage` query parameters. Pages are zero-indexed. Responses include the total count alongside the result array. Default `perPage` varies by endpoint (typically 20 for threads, 50-100 for admin lists).

## Endpoint Reference

| Method                | Path                        | Description                     | Auth              | Docs                            |
| --------------------- | --------------------------- | ------------------------------- | ----------------- | ------------------------------- |
| ALL                   | `/v1/auth/*`                | Better Auth endpoints           | Varies            | [Auth](auth-endpoints.md)       |
| POST                  | `/v1/chat/:agentId`         | Stream chat with an agent (SSE) | Session / API key | [Chat](chat.md)                 |
| GET/POST/PATCH/DELETE | `/v1/threads`               | Thread CRUD                     | Session           | [Threads](threads.md)           |
| POST                  | `/v1/search`                | Vector search                   | Session / API key | [Search](search.md)             |
| POST                  | `/v1/search/hybrid`         | Hybrid vector + keyword search  | Session / API key | [Search](search.md)             |
| GET/POST/PATCH/DELETE | `/v1/sync-targets`          | Sync target management          | Session           | [Sync Targets](sync-targets.md) |
| GET/POST/PATCH/DELETE | `/v1/documents`             | Document management             | Session           | [Documents](documents.md)       |
| GET/POST              | `/v1/feedback`              | Feedback on AI responses        | Session           | [Feedback](feedback.md)         |
| GET/POST/DELETE       | `/v1/queues`                | BullMQ queue management         | Session           | [Queues](queues.md)             |
| GET                   | `/v1/widget/config`         | Widget configuration (public)   | None              | [Widget](widget.md)             |
| GET                   | `/v1/admin/dashboard/*`     | Analytics dashboard             | Admin             | [Dashboard](dashboard.md)       |
| GET/POST/PATCH/DELETE | `/v1/admin/reviews`         | Thread reviews and annotations  | Admin             | [Reviews](reviews.md)           |
| GET/POST/PATCH/DELETE | `/v1/admin/datasets`        | Evaluation datasets             | Admin             | [Datasets](datasets.md)         |
| GET/POST/DELETE       | `/v1/admin/experiments`     | A/B experiments                 | Admin             | [Experiments](experiments.md)   |
| GET/POST/PATCH/DELETE | `/v1/admin/scorers`         | Scorer definitions and versions | Admin             | [Scorers](scorers.md)           |
| GET                   | `/v1/admin/traces`          | Distributed traces              | Admin             | [Traces](traces.md)             |
| GET/POST/PATCH/DELETE | `/v1/metadata-field-groups` | Metadata field groups           | Session           | [Metadata](metadata.md)         |
| GET/POST/PATCH/DELETE | `/v1/metadata-templates`    | Metadata templates              | Session           | [Metadata](metadata.md)         |

### Mastra Auto-Generated Endpoints

These endpoints are provided automatically by the Mastra server framework.

| Method | Path                            | Description                  |
| ------ | ------------------------------- | ---------------------------- |
| POST   | `/api/agents/:agentId/generate` | Generate a complete response |
| POST   | `/api/agents/:agentId/stream`   | Stream a response (SSE)      |
| GET    | `/api/memory/threads`           | List conversation threads    |
| POST   | `/api/memory/threads`           | Create a new thread          |
| GET    | `/api/memory/threads/:id`       | Get thread details           |
| GET    | `/api/memory/status`            | Memory system status         |
| POST   | `/api/memory/save-messages`     | Save messages to a thread    |
| GET    | `/api/memory/working-memory`    | Get working memory           |
| PUT    | `/api/memory/working-memory`    | Update working memory        |

Available agent IDs: `typhoon-supervisor`, `knowledge`
