# Threads

Thread endpoints provide CRUD operations for conversation threads. All threads are scoped to the authenticated user -- users can only access their own threads.

**Auth:** Session cookie or `X-API-Key` header (all endpoints).

---

## List Threads

```
GET /v1/threads
```

Returns a paginated list of threads for the authenticated user.

### Query Parameters

| Parameter | Type   | Default | Description              |
| --------- | ------ | ------- | ------------------------ |
| `page`    | number | `0`     | Zero-indexed page number |
| `perPage` | number | `20`    | Results per page         |

### Response

```json
{
  "threads": [...],
  "total": 42
}
```

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/threads?page=0&perPage=10"
```

---

## Get Thread

```
GET /v1/threads/:threadId
```

Returns a single thread with its messages. Messages include hydrated chunk sources (the document chunks referenced in AI responses).

### Path Parameters

| Parameter  | Type   | Description                  |
| ---------- | ------ | ---------------------------- |
| `threadId` | string | **Required.** The thread ID. |

### Response

Returns the thread object with its full message history and associated metadata.

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/threads/abc-123"
```

---

## Create Thread

```
POST /v1/threads
```

Creates a new conversation thread for the authenticated user.

### Request Body

```json
{
  "title": "Refund policy questions",
  "metadata": { "source": "desk" }
}
```

| Field      | Type   | Default | Description                  |
| ---------- | ------ | ------- | ---------------------------- |
| `title`    | string | `""`    | Thread title                 |
| `metadata` | object | `{}`    | Arbitrary key-value metadata |

### Response

```
HTTP 201
```

Returns the created thread object.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"title": "Refund questions"}' \
  http://localhost:5172/v1/threads
```

---

## Update Thread

```
PATCH /v1/threads/:threadId
```

Updates a thread's title and/or metadata.

### Path Parameters

| Parameter  | Type   | Description                  |
| ---------- | ------ | ---------------------------- |
| `threadId` | string | **Required.** The thread ID. |

### Request Body

```json
{
  "title": "Updated title",
  "metadata": { "resolved": true }
}
```

| Field      | Type   | Description                                |
| ---------- | ------ | ------------------------------------------ |
| `title`    | string | New title (optional)                       |
| `metadata` | object | New metadata (optional, replaces existing) |

### Response

Returns the updated thread object.

---

## Delete Thread

```
DELETE /v1/threads/:threadId
```

Deletes a thread and all its messages.

### Path Parameters

| Parameter  | Type   | Description                  |
| ---------- | ------ | ---------------------------- |
| `threadId` | string | **Required.** The thread ID. |

### Response

Returns confirmation of deletion.

### Example

```bash
curl -b /tmp/cookies -X DELETE http://localhost:5172/v1/threads/abc-123
```
