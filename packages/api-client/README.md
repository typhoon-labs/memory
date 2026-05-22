# @typhoon/api-client

Centralized API client for Typhoon frontend apps. Provides typed API calls, hierarchical query key factories, and TanStack Query option factories for all 13 domain modules.

## Architecture Context

```
apps/admin  ──>  @typhoon/api-client  ──>  @typhoon/ui (apiFetch, ApiError)
apps/desk            |                   @tanstack/react-query
apps/widget          |
                     v
              API server (apps/api, /api/v1/*)
```

`@typhoon/api-client` is consumed by all three frontend apps (admin, desk, widget). It provides the data-fetching layer between UI components and the API server, abstracting HTTP details and providing cache-friendly query keys.

Each domain module follows a consistent three-file pattern:

```
domain/
  index.ts          -- Re-exports api, queries, and types
  domain.api.ts     -- Low-level fetch calls (apiFetch wrapper)
  domain.queries.ts -- TanStack Query option factories (queryOptions)
  domain.types.ts   -- TypeScript types for API request/response shapes
```

## Usage

### Direct API Calls

For mutations and one-off fetches outside of React components:

```typescript
import { documentsApi } from '@typhoon/api-client';

// List documents
const docs = await documentsApi.list();

// Update metadata
await documentsApi.update(id, { title: 'New Title' });

// Bulk delete
await documentsApi.bulkDelete({ ids: ['abc', 'def'] });
```

### TanStack Query (Declarative)

For reactive data fetching in React components:

```typescript
import { documentsQueries } from '@typhoon/api-client';

// In a component
const { data, isLoading } = useQuery(documentsQueries.list());
const { data: doc } = useQuery(documentsQueries.detail(id));
const { data: chunks } = useQuery(documentsQueries.chunks(id));
```

### Cache Invalidation

Query keys are hierarchical -- invalidating a parent key invalidates all children:

```typescript
import { queryKeys } from '@typhoon/api-client';

// Invalidate all document queries (list, detail, chunks, etc.)
queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });

// Invalidate just the list
queryClient.invalidateQueries({ queryKey: queryKeys.documents.list() });

// Invalidate a specific document's detail
queryClient.invalidateQueries({ queryKey: queryKeys.documents.detail(id) });
```

### Mutations (in Feature Hooks)

The api-client provides the raw API calls; frontend apps wrap them in feature hooks with cache invalidation:

```typescript
// apps/admin/src/features/documents/use-delete-document.ts
import { documentsApi, queryKeys } from '@typhoon/api-client';

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => documentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}
```

## Domain Modules

### dashboard

| API Method                              | HTTP                                  | Description                    |
| --------------------------------------- | ------------------------------------- | ------------------------------ |
| `dashboardApi.getScores(params)`        | `GET /api/v1/dashboard/scores`        | Score trends over time         |
| `dashboardApi.getConversations(params)` | `GET /api/v1/dashboard/conversations` | Worst threads and user quality |
| `dashboardApi.getOverview(params)`      | `GET /api/v1/dashboard/overview`      | Latency and cost series        |

**Query Factories:** `dashboardQueries.scores(params)`, `dashboardQueries.conversations(params)`, `dashboardQueries.overview(params)`

### datasets

| API Method                                  | HTTP                                        | Description                 |
| ------------------------------------------- | ------------------------------------------- | --------------------------- |
| `datasetsApi.list()`                        | `GET /api/v1/datasets`                      | List all datasets           |
| `datasetsApi.getById(id)`                   | `GET /api/v1/datasets/:id`                  | Get dataset with item count |
| `datasetsApi.create(input)`                 | `POST /api/v1/datasets`                     | Create dataset              |
| `datasetsApi.update(id, input)`             | `PATCH /api/v1/datasets/:id`                | Update dataset              |
| `datasetsApi.delete(id)`                    | `DELETE /api/v1/datasets/:id`               | Delete dataset              |
| `datasetsApi.listItems(id, version?)`       | `GET /api/v1/datasets/:id/items`            | List dataset items          |
| `datasetsApi.addItems(id, input)`           | `POST /api/v1/datasets/:id/items`           | Bulk add items              |
| `datasetsApi.updateItem(id, itemId, input)` | `PATCH /api/v1/datasets/:id/items/:itemId`  | Update item                 |
| `datasetsApi.deleteItem(id, itemId)`        | `DELETE /api/v1/datasets/:id/items/:itemId` | Delete item                 |

**Query Factories:** `datasetsQueries.list()`, `datasetsQueries.detail(id)`, `datasetsQueries.items(id, version?)`

### documents

| API Method                                   | HTTP                                       | Description                           |
| -------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| `documentsApi.list(syncTargetId?)`           | `GET /api/v1/documents`                    | List documents, optionally filtered   |
| `documentsApi.getById(id)`                   | `GET /api/v1/documents/:id`                | Get single document                   |
| `documentsApi.getChunks(id)`                 | `GET /api/v1/documents/:id/chunks`         | Get document with vector chunks       |
| `documentsApi.getParsedContent(id)`          | `GET /api/v1/documents/:id/parsed-content` | Get parsed text from S3               |
| `documentsApi.download(id)`                  | `GET /api/v1/documents/:id/download`       | Download original file (returns Blob) |
| `documentsApi.update(id, data)`              | `PATCH /api/v1/documents/:id`              | Update metadata                       |
| `documentsApi.retry(id)`                     | `POST /api/v1/documents/:id/retry`         | Retry failed document                 |
| `documentsApi.resync(id)`                    | `POST /api/v1/documents/:id/resync`        | Force re-sync                         |
| `documentsApi.delete(id)`                    | `DELETE /api/v1/documents/:id`             | Delete document                       |
| `documentsApi.bulkDelete(data)`              | `POST /api/v1/documents/bulk-delete`       | Bulk delete                           |
| `documentsApi.bulkMetadata(data)`            | `POST /api/v1/documents/bulk-metadata`     | Bulk update metadata                  |
| `documentsApi.metadataFields(syncTargetId?)` | `GET /api/v1/documents/metadata-fields`    | Distinct metadata field values        |
| `documentsApi.move(id, data)`                | `POST /api/v1/documents/:id/move`          | Move/rename source key                |

**Query Factories:** `documentsQueries.list(filters?)`, `documentsQueries.detail(id)`, `documentsQueries.chunks(id)`, `documentsQueries.parsedContent(id)`, `documentsQueries.metadataFields(syncTargetId?)`

### experiments

| API Method                      | Description                 |
| ------------------------------- | --------------------------- |
| `experimentsApi.list()`         | List all experiments        |
| `experimentsApi.getById(id)`    | Get experiment detail       |
| `experimentsApi.create(input)`  | Create and start experiment |
| `experimentsApi.cancel(id)`     | Cancel running experiment   |
| `experimentsApi.getResults(id)` | Get results with scores     |
| `experimentsApi.compare(ids)`   | Compare experiments         |

**Query Factories:** `experimentsQueries.list()`, `experimentsQueries.detail(id)`, `experimentsQueries.results(id)`, `experimentsQueries.compare(ids)`

### feedback

| API Method                          | Description                             |
| ----------------------------------- | --------------------------------------- |
| `feedbackApi.upsert(input)`         | Create/update feedback (thumbs up/down) |
| `feedbackApi.delete(messageId)`     | Remove feedback                         |
| `feedbackApi.getByThread(threadId)` | Get all feedback for a thread           |

**Query Factories:** `feedbackQueries.byThread(threadId)`

### metadata

| API Method                                | Description            |
| ----------------------------------------- | ---------------------- |
| `metadataApi.listFieldGroups()`           | List field groups      |
| `metadataApi.getFieldGroup(id)`           | Get field group detail |
| `metadataApi.createFieldGroup(input)`     | Create field group     |
| `metadataApi.updateFieldGroup(id, input)` | Update field group     |
| `metadataApi.deleteFieldGroup(id)`        | Delete field group     |
| `metadataApi.listTemplates()`             | List templates         |
| `metadataApi.getTemplate(id)`             | Get template detail    |
| `metadataApi.createTemplate(input)`       | Create template        |
| `metadataApi.updateTemplate(id, input)`   | Update template        |
| `metadataApi.deleteTemplate(id)`          | Delete template        |

**Query Factories:** `metadataQueries.fieldGroups()`, `metadataQueries.fieldGroup(id)`, `metadataQueries.templates()`, `metadataQueries.template(id)`

### queues

| API Method                                           | Description                            |
| ---------------------------------------------------- | -------------------------------------- |
| `queuesApi.list()`                                   | List all BullMQ queues with job counts |
| `queuesApi.getDetail(name)`                          | Get queue details with workers         |
| `queuesApi.listJobs(name, status?, offset?, limit?)` | Paginated job listing                  |
| `queuesApi.retryJob(name, jobId)`                    | Retry a failed job                     |
| `queuesApi.removeJob(name, jobId)`                   | Remove a job                           |
| `queuesApi.pause(name)` / `resume(name)`             | Pause/resume queue                     |
| `queuesApi.clean(name, input)`                       | Clean jobs by status and age           |
| `queuesApi.listFailedJobs()`                         | Failed jobs across all queues          |

**Query Factories:** `queuesQueries.list()`, `queuesQueries.detail(name)`, `queuesQueries.jobs(name, status?)`, `queuesQueries.failedJobs()`

### reviews

| API Method                               | Description                              |
| ---------------------------------------- | ---------------------------------------- |
| `reviewsApi.list(filters?)`              | List review threads with scores          |
| `reviewsApi.getDetail(threadId)`         | Get thread with messages and annotations |
| `reviewsApi.addAnnotation(input)`        | Add admin annotation                     |
| `reviewsApi.updateAnnotation(id, input)` | Update annotation                        |
| `reviewsApi.deleteAnnotation(id)`        | Delete annotation                        |

**Query Factories:** `reviewsQueries.list(filters?)`, `reviewsQueries.detail(threadId)`

### scorers

| API Method                                        | Description                  |
| ------------------------------------------------- | ---------------------------- |
| `scorersApi.list()`                               | List scorer definitions      |
| `scorersApi.getById(id)`                          | Get scorer with versions     |
| `scorersApi.create(input)`                        | Create scorer                |
| `scorersApi.update(id, input)`                    | Update scorer                |
| `scorersApi.delete(id)`                           | Delete scorer                |
| `scorersApi.createVersion(id, input)`             | Create version               |
| `scorersApi.publishVersion(id, versionId, input)` | Publish version              |
| `scorersApi.preview(input)`                       | Preview score against sample |
| `scorersApi.getCategories()`                      | Get category config          |

**Query Factories:** `scorersQueries.list()`, `scorersQueries.detail(id)`, `scorersQueries.categories()`

### search

| API Method                | Description                    |
| ------------------------- | ------------------------------ |
| `searchApi.vector(input)` | Vector similarity search       |
| `searchApi.hybrid(input)` | Hybrid keyword + vector search |

**Query Factories:** `searchQueries.results(query, filters?)`

### sync-targets

| API Method                               | Description             |
| ---------------------------------------- | ----------------------- |
| `syncTargetsApi.list()`                  | List sync targets       |
| `syncTargetsApi.getById(id)`             | Get sync target detail  |
| `syncTargetsApi.create(input)`           | Create sync target      |
| `syncTargetsApi.update(id, input)`       | Update sync target      |
| `syncTargetsApi.delete(id)`              | Delete sync target      |
| `syncTargetsApi.sync(id, input?)`        | Trigger sync job        |
| `syncTargetsApi.scan(id)`                | Trigger scan job        |
| `syncTargetsApi.getJobs(id)`             | Get sync job history    |
| `syncTargetsApi.browse(id, path?)`       | Browse source storage   |
| `syncTargetsApi.getSources()`            | List registered sources |
| `syncTargetsApi.createFolder(id, input)` | Create folder           |
| `syncTargetsApi.deleteFolder(id, input)` | Delete folder           |
| `syncTargetsApi.moveFolder(id, input)`   | Move/rename folder      |

**Query Factories:** `syncTargetsQueries.list()`, `syncTargetsQueries.detail(id)`, `syncTargetsQueries.jobs(id)`, `syncTargetsQueries.browse(id, path?)`

### threads

| API Method                     | Description              |
| ------------------------------ | ------------------------ |
| `threadsApi.list()`            | List all threads         |
| `threadsApi.getById(id)`       | Get thread with messages |
| `threadsApi.create(input)`     | Create thread            |
| `threadsApi.update(id, input)` | Update thread            |
| `threadsApi.delete(id)`        | Delete thread            |

**Query Factories:** `threadsQueries.list()`, `threadsQueries.detail(id)`

### traces

| API Method                | Description                |
| ------------------------- | -------------------------- |
| `tracesApi.list(params?)` | List traces with filtering |
| `tracesApi.getDetail(id)` | Get trace with span tree   |

**Query Factories:** `tracesQueries.list(filters?)`, `tracesQueries.detail(id)`

## Query Key Factory

The `queryKeys` object provides hierarchical, type-safe query keys for all domains:

```typescript
import { queryKeys } from '@typhoon/api-client';

// Base keys (for broad invalidation)
queryKeys.documents.all; // ['documents']
queryKeys.syncTargets.all; // ['sync-targets']

// Parameterized keys
queryKeys.documents.list({ syncTargetId }); // ['documents', 'list', { syncTargetId }]
queryKeys.documents.detail(id); // ['documents', 'detail', id]
queryKeys.documents.chunks(id); // ['documents', 'chunks', id]
queryKeys.experiments.compare(ids); // ['experiments', 'compare', ...ids]
queryKeys.dashboard.scores(params); // ['dashboard', 'scores', params]
```

Invalidating `queryKeys.documents.all` (the parent) automatically invalidates `list`, `detail`, `chunks`, `parsedContent`, and `metadataFields` queries via TanStack Query's prefix matching.

## Internal Structure

```
src/
  index.ts           -- Package entry point (re-exports everything)
  client.ts          -- Re-exports apiFetch/ApiError from @typhoon/ui
  query-keys.ts      -- Hierarchical query key factory
  dashboard/
    index.ts, dashboard.api.ts, dashboard.queries.ts, dashboard.types.ts
  datasets/
    index.ts, datasets.api.ts, datasets.queries.ts, datasets.types.ts
  documents/
    index.ts, documents.api.ts, documents.queries.ts, documents.types.ts
  experiments/
    index.ts, experiments.api.ts, experiments.queries.ts, experiments.types.ts
  feedback/
    index.ts, feedback.api.ts, feedback.queries.ts, feedback.types.ts
  metadata/
    index.ts, metadata.api.ts, metadata.queries.ts, metadata.types.ts
  queues/
    index.ts, queues.api.ts, queues.queries.ts, queues.types.ts
  reviews/
    index.ts, reviews.api.ts, reviews.queries.ts, reviews.types.ts
  scorers/
    index.ts, scorers.api.ts, scorers.queries.ts, scorers.types.ts
  search/
    index.ts, search.api.ts, search.queries.ts, search.types.ts
  sync-targets/
    index.ts, sync-targets.api.ts, sync-targets.queries.ts, sync-targets.types.ts
  threads/
    index.ts, threads.api.ts, threads.queries.ts, threads.types.ts
  traces/
    index.ts, traces.api.ts, traces.queries.ts, traces.types.ts
```

## Dependencies

| Package                 | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `@typhoon/ui`              | `apiFetch` wrapper and `ApiError` class |
| `@tanstack/react-query` | `queryOptions` factory                  |

## Cross-References

- API reference: [../../docs/api-reference.md](../../docs/api-reference.md)
- Frontend architecture: [../../docs/frontend/](../../docs/frontend/)
- Services (backend counterparts): [../services/README.md](../services/README.md)
- UI components (consumers): [../ui/README.md](../ui/README.md)
- Chat components (consumers): [../chat/README.md](../chat/README.md)
