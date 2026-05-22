# Traces

Trace endpoints provide access to distributed traces collected via OpenTelemetry. Traces capture the full execution flow of agent interactions, including LLM calls, tool invocations, and database queries.

**Auth:** Admin required (`requireAuth` + `requireAdmin` middleware).

Results are cached server-side for 30 seconds.

---

## List Traces

```
GET /v1/admin/traces
```

Returns a paginated, filterable list of traces. Supports extensive filtering by date range, status, entity type, span type, duration, and free-text search.

### Query Parameters

| Parameter       | Type              | Default     | Description                                         |
| --------------- | ----------------- | ----------- | --------------------------------------------------- |
| `dateFrom`      | string (ISO 8601) | 30 days ago | Start of the date range.                            |
| `dateTo`        | string (ISO 8601) | Now         | End of the date range.                              |
| `page`          | number            | `0`         | Zero-indexed page number.                           |
| `perPage`       | number            | `50`        | Results per page. Max 100, min 1.                   |
| `status`        | string            | --          | Filter by trace status (e.g., `ok`, `error`).       |
| `entityType`    | string            | --          | Filter by entity type.                              |
| `spanType`      | string            | --          | Filter by span type (e.g., `llm`, `tool`, `agent`). |
| `minDurationMs` | number            | --          | Minimum trace duration in milliseconds.             |
| `maxDurationMs` | number            | --          | Maximum trace duration in milliseconds.             |
| `search`        | string            | --          | Free-text search across trace attributes.           |
| `threadId`      | string            | --          | Filter traces by conversation thread ID.            |

### Example

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/traces?status=error&minDurationMs=5000&perPage=20"
```

### Example: Traces for a Thread

```bash
curl -b /tmp/cookies \
  "http://localhost:5172/v1/admin/traces?threadId=thread-abc-123"
```

---

## Get Trace Detail

```
GET /v1/admin/traces/:traceId
```

Returns the full span tree for a trace. Each span includes its name, type, status, duration, attributes, and child spans forming a hierarchical tree.

### Path Parameters

| Parameter | Type   | Description                                                                          |
| --------- | ------ | ------------------------------------------------------------------------------------ |
| `traceId` | string | **Required.** The trace ID (typically a 32-character hex string from OpenTelemetry). |

### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/admin/traces/abc123def456...
```

### Errors

| Status | Condition        |
| ------ | ---------------- |
| 404    | Trace not found. |
