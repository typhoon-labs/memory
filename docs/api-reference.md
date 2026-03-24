# API Reference

**Base URL:** `http://localhost:4000`

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

## Custom Routes

### Chat

```
POST /chat/:agentId                    Stream chat with any agent (SSE, AI SDK protocol)
POST /widget/chat                      Widget chat (API key required, SSE)
```

### Sync Targets

```
GET    /sync-targets                   List all configured S3 sources
POST   /sync-targets                   Create a new sync source
GET    /sync-targets/:id               Get sync source details
PATCH  /sync-targets/:id               Update sync source
DELETE /sync-targets/:id               Delete sync source
POST   /sync-targets/:id/sync          Trigger manual sync
GET    /sync-targets/:id/jobs          List sync job history
```

**Create sync target:**
```json
POST /sync-targets
{
  "name": "Support Docs",
  "bucketName": "typhoon-documents",
  "prefix": "support/"
}
```

### Documents

```
GET /documents                         List all documents
GET /documents/:id                     Get document details
```

### Feedback

```
POST /feedback                         Submit feedback on an AI response
GET  /feedback                         List all feedback entries
```

**Submit feedback:**
```json
POST /feedback
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
GET /widget/config                     Get widget configuration (name, welcome message)
```

### Auth (Better Auth)

```
/auth/*                                All Better Auth endpoints (login, register, session, API keys)
```

See [Better Auth documentation](https://www.better-auth.com/docs) for the complete list of auth endpoints.
