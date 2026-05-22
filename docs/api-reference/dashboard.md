# Dashboard

Dashboard endpoints provide analytics data for the admin dashboard. All endpoints require admin privileges and support date range filtering. Results are cached server-side for 30 seconds.

**Auth:** Admin required (`requireAuth` + `requireAdmin` middleware).

### Common Query Parameters

All dashboard endpoints accept these date range parameters:

| Parameter  | Type              | Default     | Description              |
| ---------- | ----------------- | ----------- | ------------------------ |
| `dateFrom` | string (ISO 8601) | 30 days ago | Start of the date range. |
| `dateTo`   | string (ISO 8601) | Now         | End of the date range.   |

---

## Score Trends

```
GET /v1/admin/dashboard/scores
```

Returns score trends over time, suitable for line charts and sparklines.

### Query Parameters

| Parameter  | Type   | Default     | Description                                                                          |
| ---------- | ------ | ----------- | ------------------------------------------------------------------------------------ |
| `dateFrom` | string | 30 days ago | Start date (ISO 8601).                                                               |
| `dateTo`   | string | Now         | End date (ISO 8601).                                                                 |
| `range`    | string | `30d`       | Time bucket granularity for aggregation.                                             |
| `scorerId` | string | --          | Filter by a specific scorer ID. When omitted, returns aggregates across all scorers. |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/dashboard/scores?range=7d&scorerId=scorer-uuid"
```

---

## Worst Threads

```
GET /v1/admin/dashboard/threads
```

Returns the worst-scoring threads within the date range, ordered by aggregate score (lowest first).

### Query Parameters

| Parameter  | Type   | Default     | Description                                        |
| ---------- | ------ | ----------- | -------------------------------------------------- |
| `dateFrom` | string | 30 days ago | Start date (ISO 8601).                             |
| `dateTo`   | string | Now         | End date (ISO 8601).                               |
| `limit`    | number | `10`        | Maximum number of threads to return. Capped at 50. |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/dashboard/threads?limit=5"
```

---

## User Quality

```
GET /v1/admin/dashboard/users
```

Returns per-user quality aggregates (average scores, thread counts, etc.) within the date range.

### Query Parameters

| Parameter  | Type   | Default     | Description                                      |
| ---------- | ------ | ----------- | ------------------------------------------------ |
| `dateFrom` | string | 30 days ago | Start date (ISO 8601).                           |
| `dateTo`   | string | Now         | End date (ISO 8601).                             |
| `limit`    | number | `20`        | Maximum number of users to return. Capped at 50. |

---

## Latency Percentiles

```
GET /v1/admin/dashboard/latency
```

Returns response latency percentiles (p50, p95, p99) over time.

### Query Parameters

| Parameter  | Type   | Default     | Description                              |
| ---------- | ------ | ----------- | ---------------------------------------- |
| `dateFrom` | string | 30 days ago | Start date (ISO 8601).                   |
| `dateTo`   | string | Now         | End date (ISO 8601).                     |
| `range`    | string | `30d`       | Time bucket granularity for aggregation. |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/dashboard/latency?range=7d"
```

---

## Cost / Token Usage

```
GET /v1/admin/dashboard/cost
```

Returns token usage metrics over time.

### Query Parameters

| Parameter  | Type   | Default     | Description                              |
| ---------- | ------ | ----------- | ---------------------------------------- |
| `dateFrom` | string | 30 days ago | Start date (ISO 8601).                   |
| `dateTo`   | string | Now         | End date (ISO 8601).                     |
| `range`    | string | `30d`       | Time bucket granularity for aggregation. |

---

## Document Quality

```
GET /v1/admin/dashboard/documents
```

Returns per-document quality metrics. Currently a placeholder returning an empty array.

### Response

```json
{
  "documents": [],
  "message": "Per-document quality analytics coming in a future phase."
}
```
