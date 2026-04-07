# API Reference

**Base URL:** `http://localhost:5172`

All custom routes require authentication (session cookie or `Authorization: Bearer <api-key>` header) unless noted.

## Auto-Generated Endpoints (Mastra)

These endpoints are automatically provided by the Mastra server for all registered agents and memory.

### Agents

```
POST /api/agents/:agentId/generate     Generate a complete response
POST /api/agents/:agentId/stream       Stream a response (SSE)
```

Available agent IDs: `typhoon-supervisor`, `knowledge`

### Memory

```
GET  /api/memory/threads               List conversation threads
POST /api/memory/threads               Create a new thread
GET  /api/memory/threads/:id           Get thread details
GET  /api/memory/status                Memory system status
POST /api/memory/save-messages         Save messages to a thread
GET  /api/memory/working-memory        Get working memory
PUT  /api/memory/working-memory        Update working memory
```

## Custom Routes (v1)

All custom routes are versioned under `/v1`.

### Chat

```
POST /v1/chat/:agentId                Stream chat with any agent (SSE, AI SDK protocol via Mastra chatRoute)
```

### Search

```
POST /v1/search                        Semantic search against the knowledge base
POST /v1/search/hybrid                 Hybrid vector + keyword search
```

**Semantic search request:**
```json
POST /v1/search
{
  "query": "How do I process a refund?",
  "topK": 10,
  "minScore": 0.6
}
```

**Hybrid search request:**
```json
POST /v1/search/hybrid
{
  "query": "How do I process a refund?",
  "topK": 10
}
```

### Threads

```
GET    /v1/threads                     List threads for authenticated user (paginated)
POST   /v1/threads                     Create a new thread
GET    /v1/threads/:threadId           Get thread with messages
PATCH  /v1/threads/:threadId           Update thread title/metadata
DELETE /v1/threads/:threadId           Delete thread and its messages
```

### Sources

```
GET /v1/sources                        List available source types (e.g. s3)
```

### Sync Targets

```
GET    /v1/sync-targets                List all configured sync sources
POST   /v1/sync-targets                Create a new sync source
GET    /v1/sync-targets/:id            Get sync source details
PATCH  /v1/sync-targets/:id            Update sync source
DELETE /v1/sync-targets/:id            Delete sync source and all its document vectors
POST   /v1/sync-targets/:id/sync       Trigger manual sync (body: { force?: boolean })
POST   /v1/sync-targets/:id/purge      Purge all documents and vectors for a sync target
GET    /v1/sync-targets/:id/jobs       List sync job history
POST   /v1/sync-targets/:id/upload     Upload files (multipart form: files[], path?)
GET    /v1/sync-targets/:id/browse     Browse source prefix (?path=)
POST   /v1/sync-targets/:id/folders    Create folder (body: { path })
POST   /v1/sync-targets/:id/folders/delete   Delete folder and all its contents (body: { path })
POST   /v1/sync-targets/:id/folders/move     Move/rename folder (body: { oldPath, newPath })
```

**Create sync target:**
```json
POST /v1/sync-targets
{
  "name": "Support Docs",
  "sourceType": "s3",
  "config": { "bucketName": "typhoon-documents", "prefix": "support/" },
  "cronSchedule": "0 */6 * * *"
}
```

### Documents

```
GET    /v1/documents                      List all documents (?syncTargetId= to filter)
GET    /v1/documents/:id                  Get document details
DELETE /v1/documents/:id                  Delete document, vectors, and source object
POST   /v1/documents/bulk-delete          Bulk delete up to 100 documents (body: { ids: string[] })
GET    /v1/documents/:id/chunks           List stored vector chunks ordered by startIndex
GET    /v1/documents/:id/parsed-content   Parse and return document text on demand
GET    /v1/documents/:id/download         Download original source file (attachment)
POST   /v1/documents/:id/retry            Re-queue a failed document (must be in parse_error or embed_error status)
POST   /v1/documents/:id/move             Move/rename document (body: { newSourceKey })
```

### Queues

BullMQ queue management. Available queue name: `sync`.

```
GET    /v1/queues                              List all queues with job counts and pause state
GET    /v1/queues/:name/jobs                   List jobs (?state=all|waiting|active|completed|failed|delayed, ?start, ?pageSize max 200)
POST   /v1/queues/:name/pause                  Pause a queue
POST   /v1/queues/:name/resume                 Resume a paused queue
POST   /v1/queues/:name/clean                  Remove old jobs (body: { state, grace?, limit? })
POST   /v1/queues/:name/jobs/:jobId/retry      Retry a failed job
DELETE /v1/queues/:name/jobs/:jobId            Remove a job
```

### Feedback

```
POST /v1/feedback                      Submit feedback on an AI response
GET  /v1/feedback                      List all feedback entries
```

**Submit feedback:**
```json
POST /v1/feedback
{
  "threadId": "thread-uuid",
  "messageId": "message-uuid",
  "userId": "user-uuid",
  "rating": "positive",
  "comment": "Great answer with good sources"
}
```

### Widget

```
GET  /v1/widget/config                 Get widget configuration (name, welcome message)
POST /v1/chat/:agentId                 Widget uses the same chat endpoint (API key auth via header)
```

### Auth (Better Auth)

```
/v1/auth/*                             All Better Auth endpoints (login, register, session, API keys)
```

See [Better Auth documentation](https://www.better-auth.com/docs) for the complete list of auth endpoints.
