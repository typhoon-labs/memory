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
  "minScore": 0.6,
  "rerank": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | required | Search query text |
| `topK` | number (1-50) | 10 | Number of results to return |
| `minScore` | number (0-1) | 0.6 | Discard results below threshold (skipped during retrieval when reranking, applied after) |
| `rerank` | boolean | false | Cross-encoder reranking via Cohere Rerank for improved relevance. When enabled, retrieval is inflated to `RAG_RERANK_CANDIDATES` (default 100) and the reranker selects the top `topK`. |

**Hybrid search request:**
```json
POST /v1/search/hybrid
{
  "query": "How do I process a refund?"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | required | Search query text |
| `topK` | number (1-500) | — | Number of results to return. Defaults to `RAG_RERANK_CANDIDATES` (100) or `RAG_RERANK_CANDIDATES_EXPANDED` (200) when expanded. |
| `minScore` | number (0-1) | — | Discard results below threshold (applied after reranking). Defaults to `RAG_RERANK_MIN_SCORE` when reranking. |
| `dedup` | boolean | true | Deduplicate results. Default mode deduplicates by documentId (1 per doc); expanded mode by chunkId (multi-chunk per doc). |
| `rerank` | boolean | true | Cross-encoder reranking via Cohere Rerank for relevance ordering |
| `expanded` | boolean | false | Expanded deep search — retrieves `RAG_RERANK_CANDIDATES_EXPANDED` candidates and deduplicates by chunkId (showing multiple passages per document) |

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
POST   /v1/sync-targets/:id/cancel            Cancel a running sync job
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
PATCH  /v1/documents/:id                  Update document metadata (body: { title?, description?, customMetadata? })
DELETE /v1/documents/:id                  Delete document, vectors, and source object
POST   /v1/documents/bulk-delete          Bulk delete up to 100 documents (body: { ids: string[] })
POST   /v1/documents/bulk-metadata        Bulk update custom metadata (body: { ids: string[], metadata: Record })
GET    /v1/documents/metadata-fields      List distinct metadata keys and value distributions (?syncTargetId=)
GET    /v1/documents/:id/chunks           List stored vector chunks ordered by startIndex
GET    /v1/documents/:id/parsed-content   Parse and return document text on demand
GET    /v1/documents/:id/download         Download original source file (attachment)
POST   /v1/documents/:id/retry            Re-queue a failed document (must be in parse_error or embed_error status)
POST   /v1/documents/:id/resync           Re-fetch, re-parse, re-chunk, and re-embed a document from source
POST   /v1/documents/:id/move             Move/rename document (body: { newSourceKey })
```

### Queues

BullMQ queue management. Available queue names: `sync`, `reviews`, `scoring`, `experiments`, `reports`.

```
GET    /v1/queues                              List all queues with job counts and pause state
GET    /v1/queues/events                       SSE stream of real-time queue events (job state changes)
GET    /v1/queues/:name/workers                List active workers for a queue
GET    /v1/queues/:name/jobs                   List jobs (?state=all|waiting|active|completed|failed|delayed, ?start, ?pageSize max 200)
POST   /v1/queues/:name/pause                  Pause a queue
POST   /v1/queues/:name/resume                 Resume a paused queue
POST   /v1/queues/:name/clean                  Remove old jobs (body: { state, grace?, limit? })
POST   /v1/queues/:name/jobs/:jobId/retry      Retry a failed job
DELETE /v1/queues/:name/jobs/:jobId            Remove a job
GET    /v1/queues/failed-jobs                  List archived failed jobs (?queue=, ?limit=, ?offset=)
GET    /v1/queues/failed-jobs/:id              Get archived failed job detail
DELETE /v1/queues/failed-jobs/:id              Delete archived failed job
```

### Feedback

```
POST /v1/feedback                      Upsert or delete feedback on an AI response
GET  /v1/feedback                      List feedback entries (?threadId= to filter by thread for current user; omit for all)
```

**Upsert feedback:**
```json
POST /v1/feedback
{
  "messageId": "message-uuid",
  "rating": "positive",
  "comment": "Great answer with good sources"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messageId` | string | Yes | Message external ID |
| `rating` | `"positive"` \| `"negative"` \| `null` | Yes | Set `null` to delete existing feedback |
| `comment` | string \| null | No | Optional comment |

User identity is resolved from the session — no `userId` or `threadId` in the body.

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

## Admin Routes

All admin routes require both `requireAuth` and `requireAdmin` middleware (except metadata routes which only require `requireAuth`).

### Reviews

```
GET    /v1/admin/reviews                                              List threads with aggregate scores (?sortBy=, ?annotationStatus=)
GET    /v1/admin/reviews/:threadId                                    Thread detail with messages, scores, and feedback
POST   /v1/admin/reviews/:threadId/messages/:messageId/annotate       Create human annotation
PATCH  /v1/admin/reviews/:threadId/messages/:messageId/annotate       Update existing annotation
DELETE /v1/admin/reviews/:threadId/messages/:messageId/annotate       Delete annotation
```

### Datasets

```
GET    /v1/admin/datasets                    List datasets (paginated)
POST   /v1/admin/datasets                    Create dataset
GET    /v1/admin/datasets/:id                Get dataset by ID
PATCH  /v1/admin/datasets/:id                Update dataset
DELETE /v1/admin/datasets/:id                Delete dataset
GET    /v1/admin/datasets/:id/items          List dataset items (paginated)
POST   /v1/admin/datasets/:id/items          Add dataset items (single or batch)
PATCH  /v1/admin/datasets/:id/items/:itemId  Update a dataset item
DELETE /v1/admin/datasets/:id/items/:itemId  Delete a dataset item
```

### Experiments

```
GET    /v1/admin/experiments                 List experiments (paginated, ?status= filter)
POST   /v1/admin/experiments                 Create experiment and enqueue job
GET    /v1/admin/experiments/compare          Compare two experiments (?a=, ?b=)
GET    /v1/admin/experiments/:id             Get experiment by ID
DELETE /v1/admin/experiments/:id             Cancel or delete experiment
GET    /v1/admin/experiments/:id/results     Get experiment results (paginated)
```

### Scorers

```
GET    /v1/admin/scorers/models              List available LLM models for scorer selection
GET    /v1/admin/scorers                     List scorer definitions with active version (paginated, ?status= filter)
POST   /v1/admin/scorers                     Create scorer definition with initial version
GET    /v1/admin/scorers/:id                 Get scorer definition with active version
PATCH  /v1/admin/scorers/:id                 Update scorer definition status
DELETE /v1/admin/scorers/:id                 Delete scorer definition
GET    /v1/admin/scorers/:id/versions        List version history for a scorer (paginated)
POST   /v1/admin/scorers/:id/versions        Create a new version
POST   /v1/admin/scorers/:id/publish         Publish a version (set as active)
POST   /v1/admin/scorers/:id/preview         Preview/test a scorer against sample data
```

### Traces

```
GET    /v1/admin/traces                      List traces with filtering, aggregation, and pagination
GET    /v1/admin/traces/:traceId             Get full span tree for a trace
```

### Dashboard

```
GET    /v1/admin/dashboard/scores            Score trends over time (line chart + sparkline data)
GET    /v1/admin/dashboard/threads           Worst-scoring threads
GET    /v1/admin/dashboard/users             Per-user quality aggregates
GET    /v1/admin/dashboard/latency           Response latency percentiles (p50, p95, p99)
GET    /v1/admin/dashboard/cost              Token usage metrics
GET    /v1/admin/dashboard/documents         Per-document quality metrics
```

### Metadata Field Groups

```
GET    /v1/metadata-field-groups             List all metadata field groups
POST   /v1/metadata-field-groups             Create metadata field group
GET    /v1/metadata-field-groups/:id         Get metadata field group by ID
PATCH  /v1/metadata-field-groups/:id         Update metadata field group
DELETE /v1/metadata-field-groups/:id         Delete metadata field group
```

### Metadata Templates

```
GET    /v1/metadata-templates                List all metadata templates with effective schemas
POST   /v1/metadata-templates                Create metadata template
GET    /v1/metadata-templates/:id            Get metadata template with effective schema and sync target count
PATCH  /v1/metadata-templates/:id            Update metadata template
DELETE /v1/metadata-templates/:id            Delete metadata template
```
