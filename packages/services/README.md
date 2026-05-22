# @typhoon/services

Shared service layer for Typhoon. Contains all business logic -- used by both the API server and the background worker. Services sit between routes (HTTP layer) and repositories (data access layer), following the Route -> Service -> Repository pattern.

## Architecture Context

```
apps/api   ──>  @typhoon/services  ──>  @typhoon/db (repos)
apps/worker          |                @typhoon/ingestion (pipeline functions)
                     |                @typhoon/types (validation)
                     |                @typhoon/queue (job data types)
                     v
              Composition root (apps/*/src/services.ts)
```

`@typhoon/services` is the primary consumer of `@typhoon/db` repos and `@typhoon/ingestion` pipeline utilities. It is consumed by:

- **`apps/api`** -- Routes call service methods and map results to HTTP responses
- **`apps/worker`** -- Worker jobs call service methods for business logic that overlaps with API operations

Services never import HTTP types (Hono context, request, response). Routes never import database types (Drizzle, SQL). This enforces a clean separation of concerns.

## Dependency Injection

Every service receives its dependencies via a typed `*Deps` interface in the constructor. Dependencies are wired in composition roots (`apps/*/src/services.ts`):

```typescript
// apps/api/src/services.ts
import { DocumentService } from '@typhoon/services';

const documentService = new DocumentService({
  documentRepo,
  syncTargetRepo,
  metadataRepo,
  vectorStore,
  syncQueue,
  sql,
});
```

This pattern:

- Makes services testable (mock deps in unit tests)
- Avoids global state or singletons
- Allows apps to wire different repo implementations if needed

## Result Pattern

All service methods return `Result<T>` instead of throwing errors:

```typescript
type Result<T> = { data: T } | { error: string; details?: unknown };
```

Use the `isError` type guard to narrow the result:

```typescript
import { isError } from '@typhoon/services';

const result = await documentService.getById(id);
if (isError(result)) {
  // result.error is a string like 'Not found', 'validation-failed'
  return errorResponse(c, result.error, 404);
}
// result.data is the document
return c.json(result.data);
```

Error strings are intentionally short and machine-readable. Routes map them to appropriate HTTP status codes. The optional `details` field carries structured validation error information.

### Test Helpers

For unit tests, `assertOk()` and `assertErr()` eliminate conditional-expect patterns:

```typescript
import { assertOk, assertErr } from '@typhoon/services/test-helpers';

const data = assertOk(await service.getById('abc')); // throws if error
const err = assertErr(await service.getById('bad')); // throws if success
```

## Services

### ChatService

| Method                | Signature                                  | Description                                   |
| --------------------- | ------------------------------------------ | --------------------------------------------- |
| `setReviewsQueue()`   | `(queue: Queue) => void`                   | Wire the BullMQ reviews queue at bootstrap    |
| `enqueueScoringJob()` | `(input) => Result<{ enqueued: boolean }>` | Fire-and-forget scoring job enqueue (sampled) |

**Deps:** `isScoringEnabled: () => boolean`, `sampleRate: number`

### DashboardService

| Method               | Signature                                          | Description                                  |
| -------------------- | -------------------------------------------------- | -------------------------------------------- |
| `getScoreSeries()`   | `(params) => Promise<Result<ScoreSeriesResult>>`   | Score trends over time with bucket intervals |
| `getWorstThreads()`  | `(params) => Promise<Result<WorstThreadsResult>>`  | Worst-scoring threads in date range          |
| `getUserQuality()`   | `(params) => Promise<Result<UserQualityResult>>`   | Per-user quality aggregates                  |
| `getLatencySeries()` | `(params) => Promise<Result<LatencySeriesResult>>` | Response latency percentiles (p50/p95/p99)   |
| `getCostSeries()`    | `(params) => Promise<Result<CostSeriesResult>>`    | Token usage over time                        |

**Deps:** `dashboardRepo: DashboardRepo`

### DatasetService

| Method                          | Description                              |
| ------------------------------- | ---------------------------------------- |
| `list()`                        | List all datasets                        |
| `getById(id)`                   | Get dataset with item count              |
| `create(input)`                 | Create dataset with initial version      |
| `update(id, input)`             | Update dataset name/description          |
| `delete(id)`                    | Delete dataset and all items             |
| `listItems(id, version?)`       | List items for a dataset version         |
| `addItems(id, items)`           | Bulk add items (auto-increments version) |
| `updateItem(id, itemId, input)` | Update a single dataset item             |
| `deleteItem(id, itemId)`        | Delete a dataset item                    |

**Deps:** `datasetRepo: DatasetRepo`

### DocumentService

| Method                              | Description                                                          |
| ----------------------------------- | -------------------------------------------------------------------- |
| `getById(id)`                       | Find a single document                                               |
| `list(syncTargetId?)`               | List documents with optional sync-target filter                      |
| `getChunks(id)`                     | Get document with its vector chunks                                  |
| `getParsedContent(id, clientEtag?)` | Download, parse, and return plain text (supports 304)                |
| `download(id)`                      | Download raw file content from source                                |
| `updateMetadata(id, input)`         | Update title/description/customMetadata (validates against template) |
| `bulkUpdateMetadata(input)`         | Bulk update metadata across documents (per-document validation)      |
| `retryFailed(id)`                   | Re-queue a failed document for processing                            |
| `resync(id)`                        | Force re-sync regardless of status                                   |
| `deleteDocument(id)`                | Delete vectors + source object + mark deleted in DB                  |
| `bulkDelete(ids)`                   | Bulk delete grouped by sync target                                   |
| `move(id, newSourceKey)`            | Move/rename a document's S3 source key                               |
| `getMetadataFields(syncTargetId?)`  | Introspect metadata fields across documents                          |

**Deps:** `documentRepo`, `syncTargetRepo`, `metadataRepo`, `vectorStore`, `syncQueue`, `sql`

### ExperimentService

| Method           | Description                             |
| ---------------- | --------------------------------------- |
| `list()`         | List all experiments with dataset names |
| `getById(id)`    | Get experiment with full details        |
| `create(input)`  | Create experiment and enqueue setup job |
| `cancel(id)`     | Cancel a running experiment             |
| `getResults(id)` | Get experiment results with scores      |
| `compare(ids)`   | Compare results across experiments      |

**Deps:** `experimentRepo`, `datasetRepo`, `scorerRepo`, `experimentQueue`

### FeedbackService

| Method                      | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `upsert(input)`             | Create or update feedback (thumbs up/down with optional comment) |
| `delete(messageId, userId)` | Remove feedback for a message                                    |
| `getByThread(threadId)`     | Get all feedback for a thread                                    |

**Deps:** `feedbackRepo`

### MetadataService

| Method                                                                                                                         | Description                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `listFieldGroups()` / `getFieldGroup(id)` / `createFieldGroup(input)` / `updateFieldGroup(id, input)` / `deleteFieldGroup(id)` | CRUD for metadata field groups |
| `listTemplates()` / `getTemplate(id)` / `createTemplate(input)` / `updateTemplate(id, input)` / `deleteTemplate(id)`           | CRUD for metadata templates    |

**Deps:** `metadataRepo`, `syncTargetRepo`

### QueueService

| Method                                   | Description                            |
| ---------------------------------------- | -------------------------------------- |
| `listQueues()`                           | List all BullMQ queues with job counts |
| `getQueue(name)`                         | Get queue details with workers         |
| `listJobs(name, status, offset, limit)`  | Paginated job listing                  |
| `getJob(name, jobId)`                    | Get single job with logs               |
| `retryJob(name, jobId)`                  | Retry a failed job                     |
| `removeJob(name, jobId)`                 | Remove a job                           |
| `pauseQueue(name)` / `resumeQueue(name)` | Pause/resume a queue                   |
| `cleanQueue(name, input)`                | Clean jobs by status and age           |
| `listFailedJobs()`                       | List failed jobs across all queues     |

**Deps:** `queueInstances: Map<string, Queue>`, `redisOptions`

### ReviewService

| Method                        | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `list(filters?)`              | List review threads with aggregate scores         |
| `getDetail(threadId)`         | Get thread with messages, scores, and annotations |
| `addAnnotation(input)`        | Add admin annotation to a review                  |
| `updateAnnotation(id, input)` | Update annotation status/content                  |
| `deleteAnnotation(id)`        | Delete annotation                                 |
| `getAnnotationTags()`         | Get available annotation tags                     |

**Deps:** `reviewRepo`, `scorerRepo`

### ScorerService

| Method                                 | Description                                 |
| -------------------------------------- | ------------------------------------------- |
| `list()`                               | List all scorer definitions                 |
| `getById(id)`                          | Get scorer with versions                    |
| `create(input)`                        | Create scorer definition + initial version  |
| `update(id, input)`                    | Update scorer metadata                      |
| `delete(id)`                           | Delete scorer and all versions/scores       |
| `createVersion(id, input)`             | Create a new version                        |
| `publishVersion(id, versionId, input)` | Publish a version                           |
| `preview(input)`                       | Run a scorer against sample input           |
| `getCategories()`                      | Get category config and active scorer names |

**Deps:** `scorerRepo`, `scoreRepo`

### ScoringService

| Method                                    | Description                                    |
| ----------------------------------------- | ---------------------------------------------- |
| `getMessagesForScoring(messageId)`        | Fetch assistant + user message content         |
| `resolveLatestAssistantMessage(threadId)` | Find latest assistant message in thread        |
| `hydrateChunks(chunkIds)`                 | Retrieve chunk text from pgvector              |
| `hasExistingScore(entityId, scorerId)`    | Idempotency check                              |
| `saveScore(score)`                        | Persist a score record                         |
| `getActiveDefinitions()`                  | Get active scorer definitions for job handlers |

**Deps:** `messageRepo`, `scoreRepo`, `scorerRepo`, `vectorStore`

### SearchService

| Method                | Description                                     |
| --------------------- | ----------------------------------------------- |
| `vectorSearch(input)` | Pure vector similarity search                   |
| `hybridSearch(input)` | Combined keyword + vector search with reranking |

**Deps:** `vectorStore`, `sql`

### SyncTargetService

| Method                    | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `list()`                  | List all sync targets with document counts            |
| `getById(id)`             | Get sync target with full details                     |
| `create(input)`           | Create sync target (validates config, assigns source) |
| `update(id, input)`       | Update sync target                                    |
| `delete(id)`              | Delete sync target and all documents                  |
| `triggerSync(id, opts?)`  | Trigger sync/scan job                                 |
| `triggerScan(id)`         | Trigger scan-only job                                 |
| `getJobs(id)`             | Get sync job history                                  |
| `browse(id, path?)`       | Browse source storage (list objects/folders)          |
| `getSources()`            | List registered source definitions                    |
| `createFolder(id, input)` | Create a folder in source storage                     |
| `deleteFolder(id, input)` | Delete a folder from source storage                   |
| `moveFolder(id, input)`   | Rename/move a folder in source storage                |

**Deps:** `syncTargetRepo`, `documentRepo`, `metadataRepo`, `vectorStore`, `syncQueue`, `sql`

### ThreadService

| Method                  | Description                        |
| ----------------------- | ---------------------------------- |
| `list()`                | List all threads                   |
| `getById(id)`           | Get thread with formatted messages |
| `delete(id)`            | Delete thread                      |
| `getMessages(threadId)` | Get messages for a thread          |

**Deps:** `threadRepo`, `messageRepo`, `vectorStore`

**Utility exports:** `isSystemReminder()`, `normalizeToolPart()`, `toThreadResponse()`, `toUIMessage()`, `hydrateChunkSources()`

### TraceService

| Method               | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `list(params)`       | List traces with filtering (agent, status, date range) |
| `getDetail(traceId)` | Get trace with span tree                               |

**Deps:** `traceRepo`

## Internal Structure

```
src/
  index.ts            -- Package entry point (re-exports all services)
  types.ts            -- Result<T> type and isError guard
  test-helpers.ts     -- assertOk / assertErr test utilities
  chat/
    chat.service.ts
  dashboard/
    dashboard.service.ts
  datasets/
    dataset.service.ts
  documents/
    document.service.ts
  experiments/
    experiment.service.ts
  feedback/
    feedback.service.ts
  metadata/
    metadata.service.ts
  queues/
    queue.service.ts
  reviews/
    review.service.ts
  scorers/
    scorer.service.ts
  scoring/
    scoring.service.ts
  search/
    search.service.ts
  sync-targets/
    sync-target.service.ts
  threads/
    thread.service.ts
    hydrate-chunks.ts
  traces/
    trace.service.ts
```

Each service has a co-located `*.test.ts` file with unit tests using mocked dependencies.

## Dependencies

| Package           | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `@typhoon/db`        | Repository types and implementations                |
| `@typhoon/ingestion` | Pipeline functions (vector ops, parsers, providers) |
| `@typhoon/logger`    | Structured logging                                  |
| `@typhoon/queue`     | Job data type definitions                           |
| `@typhoon/types`     | Metadata validation, domain types                   |
| `bullmq`          | Queue type for DI                                   |

## Cross-References

- Architecture overview: [../../docs/architecture.md](../../docs/architecture.md)
- API reference: [../../docs/api-reference.md](../../docs/api-reference.md)
- Database repos: [../db/README.md](../db/README.md)
- Ingestion pipeline: [../ingestion/README.md](../ingestion/README.md)
- API routes (consumers): `apps/api/src/routes/`
