# Datasets

Dataset endpoints manage evaluation datasets used for scorer testing and A/B experiments. Each dataset contains items with input/expected-output pairs.

**Auth:** Admin required (`requireAuth` + `requireAdmin` middleware).

---

## List Datasets

```
GET /v1/admin/datasets
```

Returns a paginated list of datasets.

### Query Parameters

| Parameter | Type   | Default | Description               |
| --------- | ------ | ------- | ------------------------- |
| `page`    | number | `0`     | Zero-indexed page number. |
| `perPage` | number | `100`   | Results per page.         |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/admin/datasets?page=0&perPage=20"
```

---

## Create Dataset

```
POST /v1/admin/datasets
```

Creates a new dataset.

### Request Body

```json
{
  "name": "Refund Policy Q&A",
  "description": "Test set for refund-related questions"
}
```

### Response

```
HTTP 201
```

Returns the created dataset object.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{"name": "Refund Policy Q&A", "description": "Test set for refund-related questions"}' \
  http://localhost:5172/v1/admin/datasets
```

---

## Get Dataset

```
GET /v1/admin/datasets/:id
```

Returns a dataset by ID.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |

---

## Update Dataset

```
PATCH /v1/admin/datasets/:id
```

Updates a dataset's name and/or description.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |

### Request Body

```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

---

## Delete Dataset

```
DELETE /v1/admin/datasets/:id
```

Deletes a dataset and all its items.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |

---

## List Dataset Items

```
GET /v1/admin/datasets/:id/items
```

Returns a paginated list of items in a dataset.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |

### Query Parameters

| Parameter | Type   | Default | Description               |
| --------- | ------ | ------- | ------------------------- |
| `page`    | number | `0`     | Zero-indexed page number. |
| `perPage` | number | `100`   | Results per page.         |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/admin/datasets/ds-abc-123/items?page=0&perPage=50"
```

---

## Add Dataset Items

```
POST /v1/admin/datasets/:id/items
```

Adds one or more items to a dataset. Supports both single item and batch creation.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |

### Request Body

```json
{
  "items": [
    {
      "input": "How do I process a refund?",
      "expectedOutput": "Navigate to Orders, select the order, click Refund..."
    }
  ]
}
```

### Response

```
HTTP 201
```

Returns the created item(s).

---

## Update Dataset Item

```
PATCH /v1/admin/datasets/:id/items/:itemId
```

Updates a single dataset item.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |
| `itemId`  | string | **Required.** Item ID.    |

### Request Body

```json
{
  "input": "Updated question",
  "expectedOutput": "Updated expected answer"
}
```

---

## Delete Dataset Item

```
DELETE /v1/admin/datasets/:id/items/:itemId
```

Deletes a single dataset item.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `id`      | string | **Required.** Dataset ID. |
| `itemId`  | string | **Required.** Item ID.    |
