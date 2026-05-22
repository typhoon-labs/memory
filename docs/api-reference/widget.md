# Widget

The widget endpoints support the customer-facing chat widget. The widget configuration endpoint is public (no auth required). Chat functionality uses the standard chat endpoint with API key authentication.

---

## Get Widget Configuration

```
GET /v1/widget/config
```

**Auth:** None (public endpoint).

Returns the widget's display configuration. This is the only custom endpoint in the API that does not require authentication.

### Response

```json
{
  "name": "Typhoon Support",
  "welcomeMessage": "Hello! How can I help you today?",
  "placeholder": "Type your question..."
}
```

| Field            | Type   | Description                                     |
| ---------------- | ------ | ----------------------------------------------- |
| `name`           | string | Widget display name shown in the header.        |
| `welcomeMessage` | string | Initial greeting message displayed to the user. |
| `placeholder`    | string | Placeholder text for the message input field.   |

### Example

```bash
curl http://localhost:5172/v1/widget/config
```

---

## Widget Chat

```
POST /v1/widget/chat
```

**Auth:** `X-API-Key` header.

Streams a chat response using the `typhoon-supervisor` agent. This is a Mastra `chatRoute` shorthand that wraps the standard chat streaming with the AI SDK v6 protocol. It has `sendSources: true` and `sendReasoning: false` configured.

The widget can also use the general-purpose chat endpoint:

```
POST /v1/chat/typhoon-supervisor
```

See [Chat](chat.md) for full request/response documentation.

### Widget Deployment Model

Each widget deployment is associated with a single API key. The key is created by an admin through the Better Auth API key endpoints and embedded in the widget's configuration.

The widget authenticates every request by including the API key in the `X-API-Key` header:

```bash
curl -N -H "X-API-Key: typhoon_key_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "How do I return an item?"}]
  }' \
  http://localhost:5172/v1/widget/chat
```

This model allows multiple widget instances (e.g., different websites or products) to use separate API keys, enabling per-deployment usage tracking and access control.
