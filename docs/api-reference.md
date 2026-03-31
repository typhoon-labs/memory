# API Reference

**Base URL:** `http://localhost:5172`

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
POST /v1/search                        Server-side knowledge base search with embedding
```

**Search request:**
```json
POST /v1/search
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

### Sync Targets

```
GET    /v1/sync-targets                List all configured S3 sources
POST   /v1/sync-targets                Create a new sync source
GET    /v1/sync-targets/:id            Get sync source details
PATCH  /v1/sync-targets/:id            Update sync source
DELETE /v1/sync-targets/:id            Delete sync source
POST   /v1/sync-targets/:id/sync       Trigger manual sync
POST   /v1/sync-targets/:id/purge     Purge all documents and vectors for a sync target
GET    /v1/sync-targets/:id/jobs       List sync job history
```

**Create sync target:**
```json
POST /v1/sync-targets
{
  "name": "Support Docs",
  "bucketName": "typhoon-documents",
  "prefix": "support/"
}
```

### Documents

```
GET /v1/documents                      List all documents
GET /v1/documents/:id                  Get document details
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
