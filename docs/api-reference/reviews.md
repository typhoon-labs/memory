# Reviews

Review endpoints allow admins to inspect conversation threads, view automated quality scores, and add human annotations to individual messages.

**Auth:** Admin required (`requireAuth` + `requireAdmin` middleware).

---

## List Reviews

```
GET /v1/admin/reviews
```

Returns threads with aggregate score data for the review queue.

### Query Parameters

| Parameter          | Type   | Default  | Description                                                     |
| ------------------ | ------ | -------- | --------------------------------------------------------------- |
| `sortBy`           | string | `newest` | Sort order for threads.                                         |
| `annotationStatus` | string | `all`    | Filter by annotation status: `all`, `annotated`, `unannotated`. |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/reviews?sortBy=newest&annotationStatus=unannotated"
```

---

## Get Review Detail

```
GET /v1/admin/reviews/:threadId
```

Returns a thread's full detail including messages, automated scores grouped by message, feedback entries, and any human annotations.

### Path Parameters

| Parameter  | Type   | Description              |
| ---------- | ------ | ------------------------ |
| `threadId` | string | **Required.** Thread ID. |

### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/admin/reviews/thread-abc-123
```

---

## Create Annotation

```
POST /v1/admin/reviews/:threadId/messages/:messageId/annotate
```

Creates a human annotation on a specific AI response message. The annotating user's ID is resolved from the session. Returns 409 if an annotation already exists for this message by the same user (use PATCH to update instead).

### Path Parameters

| Parameter   | Type   | Description                           |
| ----------- | ------ | ------------------------------------- |
| `threadId`  | string | **Required.** Thread ID.              |
| `messageId` | string | **Required.** Message ID to annotate. |

### Request Body

```json
{
  "tags": ["hallucination", "incomplete"],
  "severity": "major",
  "comment": "Response fabricated a policy that does not exist"
}
```

| Field      | Type     | Required | Description                                                |
| ---------- | -------- | -------- | ---------------------------------------------------------- |
| `tags`     | string[] | Yes      | One or more annotation tags (min 1). See tag values below. |
| `severity` | string   | No       | Severity level.                                            |
| `comment`  | string   | No       | Free-text comment explaining the annotation.               |

### Annotation Tags

| Tag                  | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `wrong-answer`       | The response is factually incorrect                  |
| `hallucination`      | The response contains fabricated information         |
| `incomplete`         | The response is missing important details            |
| `wrong-source-cited` | The response cites an incorrect or irrelevant source |
| `tone-issue`         | The response has an inappropriate tone               |
| `correct`            | The response is accurate and appropriate             |

### Severity Levels

| Value      | Description                                |
| ---------- | ------------------------------------------ |
| `minor`    | Low-impact issue                           |
| `major`    | Significant issue affecting quality        |
| `critical` | Severe issue requiring immediate attention |

### Response

```
HTTP 201
```

Returns the created annotation object.

---

## Update Annotation

```
PATCH /v1/admin/reviews/:threadId/messages/:messageId/annotate
```

Updates an existing annotation. The user can only update their own annotations.

### Path Parameters

| Parameter   | Type   | Description               |
| ----------- | ------ | ------------------------- |
| `threadId`  | string | **Required.** Thread ID.  |
| `messageId` | string | **Required.** Message ID. |

### Request Body

Same schema as create (tags, severity, comment).

---

## Delete Annotation

```
DELETE /v1/admin/reviews/:threadId/messages/:messageId/annotate
```

Deletes the authenticated user's annotation on a message.

### Path Parameters

| Parameter   | Type   | Description               |
| ----------- | ------ | ------------------------- |
| `threadId`  | string | **Required.** Thread ID.  |
| `messageId` | string | **Required.** Message ID. |

### Example

```bash
curl -b /tmp/cookies -X DELETE \
  http://localhost:5172/v1/admin/reviews/thread-123/messages/msg-456/annotate
```
