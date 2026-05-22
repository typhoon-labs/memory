# Experiments

Experiment endpoints manage A/B experiments that compare different scorer configurations or agent behaviors against evaluation datasets. Creating an experiment automatically enqueues a background job on the `experiments` queue.

**Auth:** Admin required (`requireAuth` + `requireAdmin` middleware).

---

## List Experiments

```
GET /v1/admin/experiments
```

Returns a paginated list of experiments, optionally filtered by status.

### Query Parameters

| Parameter | Type   | Default | Description                                                                      |
| --------- | ------ | ------- | -------------------------------------------------------------------------------- |
| `page`    | number | `0`     | Zero-indexed page number.                                                        |
| `perPage` | number | `100`   | Results per page.                                                                |
| `status`  | string | --      | Filter by experiment status (e.g., `pending`, `running`, `completed`, `failed`). |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/admin/experiments?status=completed"
```

---

## Create Experiment

```
POST /v1/admin/experiments
```

Creates a new experiment and immediately enqueues a job for execution on the `experiments` BullMQ queue.

### Request Body

```json
{
  "name": "Scorer v2 vs v3",
  "datasetId": "dataset-uuid",
  "scorerIds": ["scorer-uuid-1", "scorer-uuid-2"],
  "description": "Comparing accuracy of scorer versions"
}
```

### Response

```
HTTP 201
```

Returns the created experiment object with its initial `pending` status.

### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Scorer v2 vs v3",
    "datasetId": "dataset-uuid",
    "scorerIds": ["scorer-uuid-1", "scorer-uuid-2"]
  }' \
  http://localhost:5172/v1/admin/experiments
```

---

## Compare Experiments

```
GET /v1/admin/experiments/compare
```

Compares the results of two experiments side by side. Both experiments must exist.

### Query Parameters

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `a`       | string | Yes      | First experiment ID.  |
| `b`       | string | Yes      | Second experiment ID. |

### Errors

| Status | Condition                                     |
| ------ | --------------------------------------------- |
| 400    | Either `a` or `b` query parameter is missing. |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/experiments/compare?a=exp-uuid-1&b=exp-uuid-2"
```

---

## Get Experiment

```
GET /v1/admin/experiments/:id
```

Returns an experiment by ID, including its configuration and current status.

### Path Parameters

| Parameter | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| `id`      | string | **Required.** Experiment ID. |

---

## Delete Experiment

```
DELETE /v1/admin/experiments/:id
```

Cancels a running experiment or deletes a completed/failed one.

### Path Parameters

| Parameter | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| `id`      | string | **Required.** Experiment ID. |

---

## Get Experiment Results

```
GET /v1/admin/experiments/:id/results
```

Returns the paginated results of an experiment. Each result contains the dataset item, the agent's response, and the scorer evaluations.

### Path Parameters

| Parameter | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| `id`      | string | **Required.** Experiment ID. |

### Query Parameters

| Parameter | Type   | Default | Description               |
| --------- | ------ | ------- | ------------------------- |
| `page`    | number | `0`     | Zero-indexed page number. |
| `perPage` | number | `100`   | Results per page.         |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/experiments/exp-uuid/results?page=0&perPage=25"
```
