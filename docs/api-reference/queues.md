# Queues

Queue endpoints expose BullMQ job queue management. These endpoints are used by the admin dashboard to monitor and control background processing.

**Auth:** Session cookie or `X-API-Key` header (all endpoints).

### Available Queues

| Queue Name    | Purpose                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `sync`        | Document sync jobs (fetch, parse, chunk, embed)                                   |
| `reviews`     | Response scoring jobs (triggered after chat completion)                            |
| `scoring`     | Scorer evaluation jobs                                                            |
| `experiments` | A/B experiment execution jobs                                                     |
| `maintenance` | DB housekeeping (partition management for `ai_spans`). Always active, no feature flag |

### Failed Job Archiver

The API server subscribes to BullMQ `failed` events on each queue via `initFailedJobArchiver()` (`apps/api/src/infra/failed-job-archiver.ts`). When a job fails terminally, the archiver persists its data, error reason, and stacktrace to the `failed_jobs` PostgreSQL table.

Unlike BullMQ's `removeOnFail` TTL (7 days by default), archived records are **permanent** and survive Redis restarts. This ensures that failed job details are available for audit and debugging long after BullMQ has cleaned them up.

The archiver is fault-tolerant -- a failed insert is logged and swallowed so it never disrupts queue event processing.

---

## List Queues

```
GET /v1/queues
```

Returns all queues with their current job counts and pause state.

### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/queues
```

---

## Queue Events (SSE)

```
GET /v1/queues/events
```

Opens a Server-Sent Events stream that pushes real-time queue events (job state changes) to the client. Used by the admin UI to live-update job status indicators.

### SSE Protocol

| Event         | Description                                                                           |
| ------------- | ------------------------------------------------------------------------------------- |
| `queue-event` | Job state change. Data is JSON: `{ "queue": "sync", "type": "completed" }`            |
| `ping`        | Heartbeat sent every 30 seconds to keep the connection alive through reverse proxies. |

The `retry` field is set to 5000ms on the initial ping, instructing the browser to reconnect after 5 seconds if the connection drops.

### Example

```bash
curl -N -b /tmp/cookies http://localhost:5172/v1/queues/events
```

---

## List Workers

```
GET /v1/queues/:name/workers
```

Lists active workers connected to a queue.

### Path Parameters

| Parameter | Type   | Description                                         |
| --------- | ------ | --------------------------------------------------- |
| `name`    | string | **Required.** Queue name (e.g., `sync`, `reviews`). |

---

## List Jobs

```
GET /v1/queues/:name/jobs
```

Lists jobs in a queue filtered by state.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `name`    | string | **Required.** Queue name. |

### Query Parameters

| Parameter  | Type   | Default | Description                                                                     |
| ---------- | ------ | ------- | ------------------------------------------------------------------------------- |
| `state`    | string | `all`   | Job state filter: `all`, `waiting`, `active`, `completed`, `failed`, `delayed`. |
| `start`    | number | `0`     | Offset for pagination.                                                          |
| `pageSize` | number | `50`    | Results per page. Maximum 200.                                                  |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/queues/sync/jobs?state=failed&pageSize=10"
```

---

## Pause Queue

```
POST /v1/queues/:name/pause
```

Pauses a queue. Workers will finish their current jobs but will not pick up new ones until the queue is resumed.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `name`    | string | **Required.** Queue name. |

---

## Resume Queue

```
POST /v1/queues/:name/resume
```

Resumes a paused queue.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `name`    | string | **Required.** Queue name. |

---

## Clean Queue

```
POST /v1/queues/:name/clean
```

Removes old jobs from a queue by state.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `name`    | string | **Required.** Queue name. |

### Request Body

```json
{
  "state": "completed",
  "grace": 0,
  "limit": 1000
}
```

| Field   | Type   | Default      | Description                                                     |
| ------- | ------ | ------------ | --------------------------------------------------------------- |
| `state` | string | **Required** | Job state to clean: `completed`, `failed`, `delayed`, `wait`.   |
| `grace` | number | `0`          | Grace period in milliseconds. Jobs older than this are removed. |
| `limit` | number | `1000`       | Maximum number of jobs to remove (1-10000).                     |

---

## Retry Job

```
POST /v1/queues/:name/jobs/:jobId/retry
```

Retries a failed job, moving it back to the waiting state.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `name`    | string | **Required.** Queue name. |
| `jobId`   | string | **Required.** Job ID.     |

---

## Remove Job

```
DELETE /v1/queues/:name/jobs/:jobId
```

Removes a job from the queue entirely.

### Path Parameters

| Parameter | Type   | Description               |
| --------- | ------ | ------------------------- |
| `name`    | string | **Required.** Queue name. |
| `jobId`   | string | **Required.** Job ID.     |

---

## List Archived Failed Jobs

```
GET /v1/queues/failed-jobs
```

Lists archived failed jobs across all queues or filtered by queue.

### Query Parameters

| Parameter | Type   | Default | Description            |
| --------- | ------ | ------- | ---------------------- |
| `queue`   | string | --      | Filter by queue name.  |
| `limit`   | number | `50`    | Results per page.      |
| `offset`  | number | `0`     | Offset for pagination. |

### Example

```bash
curl -b /tmp/cookies "http://localhost:5172/v1/queues/failed-jobs?queue=sync&limit=20"
```

---

## Get Archived Failed Job

```
GET /v1/queues/failed-jobs/:id
```

Returns details of an archived failed job.

### Path Parameters

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `id`      | string | **Required.** Archived failed job ID. |

---

## Delete Archived Failed Job

```
DELETE /v1/queues/failed-jobs/:id
```

Deletes an archived failed job record.

### Path Parameters

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `id`      | string | **Required.** Archived failed job ID. |
