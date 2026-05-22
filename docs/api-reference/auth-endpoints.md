# Auth Endpoints

## Better Auth Handler

```
ALL /v1/auth/*
```

All requests to `/v1/auth/*` are proxied to the [Better Auth](https://www.better-auth.com/docs) handler. This catch-all route does **not** require authentication -- Better Auth handles its own auth logic internally.

The server suppresses Better Auth's branded HTML error pages. If the upstream auth handler returns a non-OK response with `Content-Type: text/html`, the route rewrites it to:

```json
{ "error": "Authentication error" }
```

### Key Auth Endpoints

| Method | Path                      | Description                     |
| ------ | ------------------------- | ------------------------------- |
| POST   | `/v1/auth/sign-in/social` | Start OIDC sign-in flow         |
| GET    | `/v1/auth/callback/oidc`  | OIDC callback (redirect target) |
| GET    | `/v1/auth/get-session`    | Get current session             |
| POST   | `/v1/auth/sign-out`       | Sign out (clear session)        |

Refer to the [Better Auth documentation](https://www.better-auth.com/docs) for the complete list of available endpoints (API keys, sessions, user management, etc.).

### OIDC Sign-In Flow

In development, Typhoon uses Dex as the OIDC identity provider. The sign-in flow works as follows:

1. POST to `/v1/auth/sign-in/social` with a JSON body specifying the provider and callback URL.
2. The response contains a `url` field pointing to the Dex authorization endpoint.
3. Follow the redirect chain, authenticate with Dex, and the final callback sets the session cookie.

```bash
# Start OIDC flow
curl -s -c /tmp/cookies -H "Content-Type: application/json" \
  -d '{"provider":"oidc","callbackURL":"http://localhost:5174"}' \
  http://localhost:5172/v1/auth/sign-in/social
```

**Dev credentials:** `admin@typhoon.local` / `password` (admin), `rep@typhoon.local` / `password` (rep).

After completing the flow, the session cookie in `/tmp/cookies` can be used with `-b /tmp/cookies` on subsequent requests.

## Mastra Auto-Generated Endpoints

The Mastra server framework provides these endpoints automatically for all registered agents and the memory system.

### Agent Endpoints

```
POST /api/agents/:agentId/generate     Generate a complete response
POST /api/agents/:agentId/stream       Stream a response (SSE)
```

Available agent IDs:

| Agent ID          | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `typhoon-supervisor` | Main supervisor agent that orchestrates tool use and delegates to sub-agents |
| `knowledge`       | Knowledge search sub-agent for RAG queries                                   |

### Memory Endpoints

```
GET  /api/memory/threads               List conversation threads
POST /api/memory/threads               Create a new thread
GET  /api/memory/threads/:id           Get thread details
GET  /api/memory/status                Memory system status
POST /api/memory/save-messages         Save messages to a thread
GET  /api/memory/working-memory        Get working memory
PUT  /api/memory/working-memory        Update working memory
```

These endpoints interact directly with Mastra's built-in memory system (PgStore-backed). The custom `/v1/threads` endpoints (see [Threads](threads.md)) provide a higher-level interface with user scoping and additional features.
