# Scorers

Scorer endpoints manage LLM-based scoring definitions that evaluate AI response quality. Each scorer has a version history, and one version is published as the "active" version used for live scoring.

**Auth:** Admin required (`requireAuth` + `requireAdmin` middleware).

---

## List Available Models

```
GET /v1/admin/scorers/models
```

Returns the list of available LLM models that can be used for scorer evaluation.

### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/admin/scorers/models
```

---

## List Scorers

```
GET /v1/admin/scorers
```

Returns a paginated list of scorer definitions with their active version info.

### Query Parameters

| Parameter | Type   | Default | Description                                                    |
| --------- | ------ | ------- | -------------------------------------------------------------- |
| `page`    | number | `0`     | Zero-indexed page number.                                      |
| `perPage` | number | `100`   | Results per page.                                              |
| `status`  | string | --      | Filter by scorer status (e.g., `active`, `draft`, `archived`). |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/admin/scorers?status=active"
```

---

## Create Scorer

```
POST /v1/admin/scorers
```

Creates a new scorer definition with an initial version.

### Request Body

```json
{
  "name": "Accuracy Scorer",
  "description": "Evaluates factual accuracy of responses",
  "type": "llm",
  "config": {
    "model": "gpt-4o",
    "prompt": "Rate the accuracy of the following response..."
  }
}
```

### Response

```
HTTP 201
```

Returns the created scorer with its initial version.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Accuracy Scorer",
    "description": "Evaluates factual accuracy",
    "type": "llm",
    "config": {"model": "gpt-4o", "prompt": "Rate the accuracy..."}
  }' \
  http://localhost:5172/v1/admin/scorers
```

---

## Get Scorer

```
GET /v1/admin/scorers/:id
```

Returns a scorer definition with its active (published) version.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

---

## Update Scorer

```
PATCH /v1/admin/scorers/:id
```

Updates a scorer definition's metadata (name, description, status). Does not modify versions.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

### Request Body

```json
{
  "name": "Updated Name",
  "status": "archived"
}
```

---

## Delete Scorer

```
DELETE /v1/admin/scorers/:id
```

Deletes a scorer definition and all its versions.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

---

## List Versions

```
GET /v1/admin/scorers/:id/versions
```

Returns the version history for a scorer, paginated.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

### Query Parameters

| Parameter | Type   | Default | Description               |
| --------- | ------ | ------- | ------------------------- |
| `page`    | number | `0`     | Zero-indexed page number. |
| `perPage` | number | `100`   | Results per page.         |

---

## Create Version

```
POST /v1/admin/scorers/:id/versions
```

Creates a new version of a scorer. The new version is not automatically published -- use the publish endpoint to set it as active.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

### Request Body

```json
{
  "config": {
    "model": "gpt-4o",
    "prompt": "Updated evaluation prompt..."
  }
}
```

### Response

```
HTTP 201
```

Returns the created version.

---

## Publish Version

```
POST /v1/admin/scorers/:id/publish
```

Sets a version as the active (published) version for a scorer. If `versionId` is omitted, the latest version is published.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

### Request Body

```json
{
  "versionId": "version-uuid"
}
```

| Field       | Type   | Required | Description                                                          |
| ----------- | ------ | -------- | -------------------------------------------------------------------- |
| `versionId` | string | No       | The version ID to publish. If omitted, publishes the latest version. |

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"versionId": "version-uuid"}' \
  http://localhost:5172/v1/admin/scorers/scorer-uuid/publish
```

---

## Preview Scorer

```
POST /v1/admin/scorers/:id/preview
```

Tests a scorer against sample data without persisting the results. Useful for iterating on scorer prompts before publishing.

### Path Parameters

| Parameter | Type   | Description              |
| --------- | ------ | ------------------------ |
| `id`      | string | **Required.** Scorer ID. |

### Request Body

Provide sample data that matches the scorer's expected input format (varies by scorer type).

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "input": "How do I return an item?",
    "output": "Navigate to your orders page...",
    "expectedOutput": "Go to Orders > select item > click Return"
  }' \
  http://localhost:5172/v1/admin/scorers/scorer-uuid/preview
```
