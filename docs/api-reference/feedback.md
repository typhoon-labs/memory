# Feedback

Feedback endpoints allow users to rate and comment on AI responses. Each feedback entry is tied to a specific message and the authenticated user. Feedback is upserted -- submitting feedback for a message that already has feedback from the same user updates the existing entry.

**Auth:** Session cookie or `X-API-Key` header (all endpoints).

---

## Upsert Feedback

```
POST /v1/feedback
```

Creates or updates feedback on an AI response message. Setting `rating` to `null` deletes any existing feedback for that message.

User identity is resolved from the session -- no `userId` or `threadId` is needed in the request body.

### Request Body

```json
{
  "messageId": "message-uuid",
  "rating": "positive",
  "comment": "Great answer with good sources"
}
```

| Field       | Type                                   | Required | Description                                            |
| ----------- | -------------------------------------- | -------- | ------------------------------------------------------ |
| `messageId` | string                                 | Yes      | The external ID of the message being rated.            |
| `rating`    | `"positive"` \| `"negative"` \| `null` | Yes      | The rating. Set to `null` to delete existing feedback. |
| `comment`   | string \| null                         | No       | Optional comment explaining the rating.                |

### Response

**Created (new feedback):**

```
HTTP 201
```

Returns the feedback object (without internal `_status` field).

**Updated (existing feedback):**

```
HTTP 200
```

Returns the updated feedback object.

**Deleted (rating set to null):**

```json
{ "deleted": true }
```

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-abc-123",
    "rating": "positive",
    "comment": "Accurate and helpful"
  }' \
  http://localhost:5172/v1/feedback
```

---

## List Feedback

```
GET /v1/feedback
```

Lists feedback entries for the authenticated user. Optionally filter by thread.

### Query Parameters

| Parameter  | Type   | Description                                                                    |
| ---------- | ------ | ------------------------------------------------------------------------------ |
| `threadId` | string | Filter by thread external ID. When omitted, returns all feedback for the user. |

### Response

Returns an array of feedback objects.

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/feedback?threadId=thread-abc-123"
```
