# Chat

## Stream Chat

```
POST /v1/chat/:agentId
```

Streams a chat response using the AI SDK v6 protocol via Mastra's `handleChatStream`. Returns a Server-Sent Events (SSE) stream compatible with the AI SDK `useChat` hook and `DefaultChatTransport`.

**Auth:** Session cookie or `X-API-Key` header.

### Path Parameters

| Parameter | Type   | Description                                                                    |
| --------- | ------ | ------------------------------------------------------------------------------ |
| `agentId` | string | **Required.** The agent to chat with. One of `typhoon-supervisor` or `knowledge`. |

### Request Body

```json
{
  "messages": [{ "role": "user", "content": "How do I process a refund?" }],
  "memory": {
    "thread": "thread-uuid",
    "resource": "user-uuid"
  }
}
```

| Field             | Type   | Description                                                                       |
| ----------------- | ------ | --------------------------------------------------------------------------------- |
| `messages`        | array  | **Required.** Array of chat messages following the AI SDK message format.         |
| `memory`          | object | Memory configuration for thread persistence.                                      |
| `memory.thread`   | string | Thread ID for conversation continuity. If omitted, the conversation is stateless. |
| `memory.resource` | string | Resource ID (typically the user ID) for memory scoping.                           |

### Response

The response is an SSE stream following the AI SDK v6 UI message stream protocol. Content types include:

- **Text chunks** -- Incremental text content
- **Tool calls** -- Agent tool invocations (e.g., knowledge search)
- **Source annotations** -- Document sources used in the response (enabled via `sendSources: true`)
- **Step completions** -- Intermediate step results
- **Finish events** -- Final usage statistics and finish reason

### Side Effects

When the stream completes successfully, the server automatically enqueues a **scoring job** on the `reviews` BullMQ queue. This job evaluates the response quality using the active scorers. The scoring is asynchronous and does not affect the chat response.

### Example

```bash
curl -N -b /tmp/cookies \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "How do I process a refund?"}],
    "memory": {"thread": "abc-123", "resource": "user-456"}
  }' \
  http://localhost:5172/v1/chat/typhoon-supervisor
```

### Client Usage

**Desk app (rep interface):** Uses `useChat` from AI SDK React with `DefaultChatTransport`, passing the authenticated session cookie automatically. Messages are persisted in Mastra memory via the `memory.thread` parameter.

**Widget app (customer-facing):** Uses the same chat endpoint but authenticates via `X-API-Key` header. Each widget deployment has its own API key. The widget uses `/v1/widget/chat` (a Mastra `chatRoute` shorthand) or the full `/v1/chat/typhoon-supervisor` path.

### Error Handling

If the `agentId` path parameter is missing, the endpoint returns:

```json
HTTP 400
{ "error": "Agent ID is required" }
```

Stream errors are delivered as SSE error events. Note that the AI SDK's fetch-based stream reader may hang if the server dies mid-stream -- the `useStreamStallDetection` hook works around this by auto-aborting after 15 seconds of inactivity.
