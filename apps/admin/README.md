# @typhoon/admin

Admin dashboard for document management, sync monitoring, queue inspection, quality evaluation, and metadata configuration. Built with React 19 + Vite + TanStack Router.

## Architecture Context

The admin app is the operations control plane for the Typhoon system. It is used by administrators to manage knowledge base content, monitor background jobs, review conversation quality, run evaluation experiments, and configure metadata schemas. It communicates exclusively with the `@typhoon/api` backend via a Vite dev proxy (see [Configuration](#configuration)).

Authentication requires the `admin` role, enforced by `AdminAuthGate` which wraps all authenticated routes with `AuthGate requiredRoles={['admin']}`. OIDC is the only sign-in method (email/password is disabled).

The app follows the project-wide frontend pattern: **Page -> Feature Hook -> API Client**. Pages live in `components/pages/`, mutation hooks in `features/`, and all query keys and typed API calls come from the shared `@typhoon/api-client` package.

## Running

```bash
bun run dev   # Development server on http://localhost:5174
bun run build # Production build (tsc + vite build)
```

Default: `http://localhost:5174`

## Internal Structure

```
src/
  main.tsx              Entry point: React root, providers (Theme, QueryClient, Auth, Router)
  main.css              Tailwind import
  test-utils.ts         renderWithQueryClient helper for component tests
  routes/
    route-tree.ts       Complete route tree with validateSearch for every route
    admin-auth-gate.tsx  Wraps authenticated routes (requires admin role)
  layouts/
    admin-shell.tsx     AppShell layout with sidebar nav groups and user menu
  components/
    pages/              One file per page (or directory for complex pages with sub-components)
    charts/             Recharts-based visualization components (sparkline, score trend, latency, tokens)
    shared/             Reusable components (FieldSchemaEditor, badge popovers)
    score-text.tsx      Score display formatting helper
  features/             Mutation hooks grouped by domain
    datasets/           useCreateDataset, useUpdateDataset, useDeleteDataset, useAddDatasetItems, useUpdateDatasetItem, useDeleteDatasetItem
    documents/          useDeleteDocument, useRetryDocument, useResyncDocument, useBulkDeleteDocuments, useUpdateDocumentMetadata, useBulkUpdateMetadata, useMoveDocument
    experiments/        useCreateExperiment, useDeleteExperiment
    metadata/           useCreateFieldGroup, useUpdateFieldGroup, useDeleteFieldGroup, useCreateTemplate, useUpdateTemplate, useDeleteTemplate
    queues/             useQueueEvents (SSE subscription), useRetryJob, useRemoveJob, usePauseQueue, useResumeQueue, useCleanQueue
    reviews/            useCreateAnnotation, useUpdateAnnotation, useDeleteAnnotation
    scorers/            useCreateScorer, useUpdateScorer, useDeleteScorer, useCreateScorerVersion, usePublishScorerVersion, usePreviewScore
    sync-targets/       useCreateSyncTarget, useUpdateSyncTarget, useDeleteSyncTarget, useSyncTarget, useCancelSync, useUploadFiles, usePurgeSource
    threads/            useDeleteThread
  hooks/
    use-page-title.ts  usePageTitle + detailTitle helper (suffix: "Typhoon Admin")
```

## Pages and Routes

All routes sit under an authenticated layout (`AdminAuthGate` -> `AdminShell`). The login route is the only unauthenticated page.

| Route                                | Component                    | Description                                                                                          |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/login`                             | `AdminLoginPage`             | OIDC authentication page                                                                             |
| `/`                                  | `AdminDashboard`             | Analytics dashboard: stat cards, score trends, latency, token usage, worst threads, per-user quality |
| `/sources`                           | `SyncSourcesPage`            | List of S3/MinIO sync sources                                                                        |
| `/sources/create`                    | `SyncSourceCreatePage`       | Create a new sync source with S3 credentials and cron schedule                                       |
| `/sources/$sourceId`                 | `SyncSourceDetailPage`       | Source detail with tabs: Overview, Documents (file browser with DnD), Sync Log                       |
| `/documents`                         | `AdminDocumentsPage`         | Global document browser with sync target and status filters                                          |
| `/metadata/field-groups`             | `MetadataFieldGroupsPage`    | List of metadata field groups                                                                        |
| `/metadata/field-groups/create`      | `FieldGroupDetailPage`       | Create a new field group (dual-mode component)                                                       |
| `/metadata/field-groups/$groupId`    | `FieldGroupDetailPage`       | Edit an existing field group (dual-mode component)                                                   |
| `/metadata/templates`                | `MetadataTemplatesPage`      | List of metadata templates                                                                           |
| `/metadata/templates/create`         | `MetadataTemplateDetailPage` | Create a new template (dual-mode component)                                                          |
| `/metadata/templates/$templateId`    | `MetadataTemplateDetailPage` | Edit an existing template (dual-mode component)                                                      |
| `/reviews`                           | `ReviewsPage`                | Conversation review list with scoring and annotation status                                          |
| `/reviews/$threadId`                 | `ReviewDetailPage`           | Review detail: message timeline, annotation panel, score panel                                       |
| `/datasets`                          | `DatasetsPage`               | List of evaluation datasets                                                                          |
| `/datasets/create`                   | `DatasetCreatePage`          | Create a new dataset                                                                                 |
| `/datasets/$datasetId`               | `DatasetDetailPage`          | Dataset detail with item list                                                                        |
| `/datasets/$datasetId/items/create`  | `DatasetItemFormPage`        | Add an item to a dataset                                                                             |
| `/datasets/$datasetId/items/$itemId` | `DatasetItemFormPage`        | Edit a dataset item                                                                                  |
| `/experiments`                       | `ExperimentsPage`            | List of evaluation experiments                                                                       |
| `/experiments/create`                | `ExperimentCreatePage`       | Create and run a new experiment                                                                      |
| `/experiments/compare`               | `ExperimentComparePage`      | Side-by-side experiment comparison                                                                   |
| `/experiments/$experimentId`         | `ExperimentDetailPage`       | Experiment results detail                                                                            |
| `/scorers`                           | `ScorersPage`                | List of scorer definitions                                                                           |
| `/scorers/create`                    | `ScorerCreatePage`           | Create a new scorer with type, instructions, model config                                            |
| `/scorers/$scorerId`                 | `ScorerDetailPage`           | Scorer detail with tabs: Configuration, Versions                                                     |
| `/traces`                            | `TracesPage`                 | Trace explorer with status, entity type, and text filters                                            |
| `/traces/$traceId`                   | `TraceDetailPage`            | Trace detail with span waterfall and expand/collapse                                                 |
| `/queues`                            | `QueuesPage`                 | Job queue status overview (sync, scoring, ingestion)                                                 |
| `/queues/$queueName`                 | `QueueDetailPage`            | Queue detail with tabs: Overview, Jobs, Failed Archive                                               |

## Deep Linking (URL State)

All meaningful UI state is persisted in URL search parameters so views are shareable and survive page refresh. Each route's `validateSearch` function coerces and defaults the parameters.

| Route                        | Params                                                                                                                                                                                                        | Description                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `/sources/$sourceId`         | `tab` (`overview`\|`documents`\|`sync-log`), `path`                                                                                                                                                           | Active tab and file browser path                |
| `/documents`                 | `syncTargetId`, `status` (`all`\|`ready`\|`errors`\|`processing`\|`pending`)                                                                                                                                  | Source and status filters                       |
| `/reviews`                   | `sortBy` (`responseScore`\|`retrievalScore`\|`newest`\|`unscored`), `annotationStatus` (`all`\|`annotated`\|`unannotated`), `feedbackStatus` (`all`\|`has-feedback`\|`has-negative`\|`no-feedback`), `search` | All filters (client-side pagination)            |
| `/experiments`               | `status` (`all`\|`pending`\|`running`\|`completed`\|`failed`)                                                                                                                                                 | Status filter                                   |
| `/experiments/compare`       | `a`, `b`, `item`                                                                                                                                                                                              | Experiment IDs + selected comparison item index |
| `/experiments/$experimentId` | `result`                                                                                                                                                                                                      | Selected result detail ID                       |
| `/scorers`                   | `status` (`all`\|`draft`\|`active`\|`archived`)                                                                                                                                                               | Status filter                                   |
| `/scorers/$scorerId`         | `tab` (`configuration`\|`versions`)                                                                                                                                                                           | Active tab                                      |
| `/traces`                    | `status` (`all`\|`success`\|`error`\|`partial`), `entityType`, `search`, `threadId`                                                                                                                           | All filters                                     |
| `/traces/$traceId`           | `span`                                                                                                                                                                                                        | Selected span ID (opens detail sheet)           |
| `/queues/$queueName`         | `tab` (`overview`\|`jobs`\|`failed-archive`), `jobState` (`all`\|`failed`\|`active`\|`waiting`\|`delayed`\|`completed`)                                                                                       | Active tab and job state filter                 |

Example shareable URLs:

- `/reviews?sortBy=responseScore&annotationStatus=unannotated` -- unannotated reviews sorted by response quality
- `/traces/abc123?span=span456` -- trace with a specific span detail open
- `/experiments/compare?a=exp1&b=exp2&item=3` -- comparison with item 3 selected

## Browser Tab Titles

Each page sets a dynamic `document.title` via `usePageTitle` and `detailTitle` from `src/hooks/use-page-title.ts`. The app suffix ("Typhoon Admin") and hierarchy separator (`:`) are defined as constants there.

- List pages: "Reviews - Typhoon Admin", "Traces - Typhoon Admin"
- Detail pages: "Datasets: My Dataset - Typhoon Admin", "Traces: a1b2c3d4 - Typhoon Admin"
- Compare page: "Experiments: Compare: Baseline vs Candidate - Typhoon Admin"

## Layout Structure

`AdminShell` renders the shared `AppShell` component (from `@typhoon/ui`) with a sidebar organized into five navigation groups:

| Group          | Items                                   |
| -------------- | --------------------------------------- |
| **Overview**   | Dashboard                               |
| **Content**    | Sync Sources, Documents                 |
| **Metadata**   | Templates, Field Groups                 |
| **Quality**    | Reviews, Datasets, Experiments, Scorers |
| **Operations** | Traces, Queues                          |

The shell also initializes `useQueueEvents()` at layout level to maintain a single SSE connection for real-time queue updates across all pages.

## Key Features

- **Analytics Dashboard** -- date-range-selectable (24h to 90d) analytics with stat cards, score trend charts, latency percentiles (p50/p95/p99), token usage bars, worst-quality threads table, and per-user quality table. Score sparklines overlay stat cards.
- **Sync Source Management** -- CRUD for S3/MinIO sync sources with cron scheduling, manual sync trigger, cancel, and purge. Metadata template assignment and auto-extraction toggle.
- **File Browser** -- hierarchical file browsing with drag-and-drop reordering (@dnd-kit), folder creation, multi-file upload dialog, and file move/rename.
- **Document Management** -- global document list filterable by sync target and status. Single/bulk delete, retry failed ingestion, re-sync from source. Document detail sheet with tabs for file properties and schema-aware custom metadata editing.
- **Metadata Configuration** -- field groups (reusable sets of typed fields) and templates (compose groups + custom fields). FieldSchemaEditor provides a compact table layout with collapsible rows for advanced field options.
- **Conversation Reviews** -- review list with multi-axis filtering (sort, annotation status, feedback status, text search). Review detail shows message timeline, annotation panel (tags: wrong-answer, hallucination, incomplete, wrong-source-cited, tone-issue, correct; severity: minor/major/critical; free-text comment), and score panel.
- **Evaluation Pipeline** -- datasets (CRUD + item management), experiments (create from dataset + scorers, run, view results, side-by-side comparison), and scorers (versioned definitions with preview-scoring capability).
- **Trace Explorer** -- filterable trace list with span waterfall view, expand/collapse all, span detail sheet, and filtering by name and span type.
- **Queue Management** -- real-time job queue monitoring via SSE (useQueueEvents). Queue detail with overview stats, paginated job list with state filter, failed job archive. Actions: retry job, remove job, pause/resume queue, clean jobs by state.

## Feature Hooks and State Management

All mutation hooks live in `src/features/` and follow a consistent pattern: `useMutation` wrapping an `apiFetch` call, with `onSuccess` invalidating the relevant `queryKeys` from `@typhoon/api-client`. Hooks are grouped by domain:

| Hook                        | What it does                         | Invalidates                                                                                                         |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `useCreateDataset`          | POST to create a dataset             | `datasets.all`                                                                                                      |
| `useUpdateDataset`          | PATCH a dataset name/description     | `datasets.detail(id)`, `datasets.all`                                                                               |
| `useDeleteDataset`          | DELETE a dataset and items           | `datasets.all`                                                                                                      |
| `useAddDatasetItems`        | POST items to a dataset (batch)      | `datasets.detail(id)`                                                                                               |
| `useUpdateDatasetItem`      | PATCH a dataset item                 | `datasets.detail(id)`                                                                                               |
| `useDeleteDatasetItem`      | DELETE a dataset item                | `datasets.detail(id)`                                                                                               |
| `useDeleteDocument`         | DELETE document + vectors            | `documents.all`, `syncTargets.all` (browse)                                                                         |
| `useRetryDocument`          | POST retry ingestion                 | `documents.all`                                                                                                     |
| `useResyncDocument`         | POST re-ingest from source           | `documents.all`, `syncTargets.all` (browse)                                                                         |
| `useBulkDeleteDocuments`    | POST bulk-delete                     | `documents.all`, `syncTargets.all` (browse)                                                                         |
| `useUpdateDocumentMetadata` | PATCH title/description/metadata     | `documents.detail(id)`, `documents.all`                                                                             |
| `useBulkUpdateMetadata`     | POST bulk metadata update            | `documents.all`                                                                                                     |
| `useMoveDocument`           | POST move/rename (S3 only)           | `documents.all`, `syncTargets.all` (browse)                                                                         |
| `useCreateExperiment`       | POST create + enqueue evaluation     | `experiments.all`                                                                                                   |
| `useDeleteExperiment`       | DELETE experiment + results          | `experiments.all`                                                                                                   |
| `useCreateFieldGroup`       | POST create field group              | `metadata.fieldGroups()`                                                                                            |
| `useUpdateFieldGroup`       | PATCH field group                    | `metadata.fieldGroup(id)`, `metadata.fieldGroups()`, `metadata.templates()`                                         |
| `useDeleteFieldGroup`       | DELETE field group                   | `metadata.fieldGroups()`, `metadata.templates()`                                                                    |
| `useCreateTemplate`         | POST create template                 | `metadata.templates()`                                                                                              |
| `useUpdateTemplate`         | PATCH template                       | `metadata.template(id)`, `metadata.templates()`                                                                     |
| `useDeleteTemplate`         | DELETE template                      | `metadata.templates()`                                                                                              |
| `useQueueEvents`            | SSE subscription for queue events    | Debounced: `queues.all`, `queues.detail(queue)`. Sync queue also invalidates `documents.all` and `syncTargets.all`. |
| `useRetryJob`               | POST retry failed job                | `queues.all`                                                                                                        |
| `useRemoveJob`              | DELETE job from queue                | `queues.all`                                                                                                        |
| `usePauseQueue`             | POST pause queue                     | `queues.all`                                                                                                        |
| `useResumeQueue`            | POST resume queue                    | `queues.all`                                                                                                        |
| `useCleanQueue`             | POST clean old jobs by state         | `queues.all`                                                                                                        |
| `useCreateAnnotation`       | POST annotation on message           | `reviews.detail(threadId)`, `reviews.all`                                                                           |
| `useUpdateAnnotation`       | PATCH annotation                     | `reviews.detail(threadId)`, `reviews.all`                                                                           |
| `useDeleteAnnotation`       | DELETE annotation                    | `reviews.detail(threadId)`, `reviews.all`                                                                           |
| `useCreateScorer`           | POST create scorer + initial version | `scorers.all`                                                                                                       |
| `useUpdateScorer`           | PATCH scorer status                  | `scorers.detail(id)`, `scorers.all`                                                                                 |
| `useDeleteScorer`           | DELETE scorer                        | `scorers.all`                                                                                                       |
| `useCreateScorerVersion`    | POST new version                     | `scorers.detail(id)`, `scorers.all`                                                                                 |
| `usePublishScorerVersion`   | POST publish (set active)            | `scorers.detail(id)`, `scorers.all`                                                                                 |
| `usePreviewScore`           | POST preview-score a sample          | (none -- returns result)                                                                                            |
| `useCreateSyncTarget`       | POST create sync target              | `syncTargets.all`                                                                                                   |
| `useUpdateSyncTarget`       | PATCH sync target                    | `syncTargets.detail(id)`, `syncTargets.all`                                                                         |
| `useDeleteSyncTarget`       | DELETE sync target + documents       | `syncTargets.all`                                                                                                   |
| `useSyncTarget`             | POST trigger sync job                | `syncTargets.jobs(id)`                                                                                              |
| `useCancelSync`             | POST cancel running sync             | `syncTargets.jobs(id)`                                                                                              |
| `useUploadFiles`            | POST multipart file upload           | `syncTargets.browse(id)`, `documents.all`                                                                           |
| `usePurgeSource`            | POST purge all documents             | `documents.all`, `syncTargets.jobs(id)`                                                                             |
| `useDeleteThread`           | DELETE thread + messages             | `threads.all`                                                                                                       |

## Component Test Patterns

Tests use Vitest + Testing Library and follow these patterns:

- **`renderWithQueryClient`** (`src/test-utils.ts`) -- wraps component in a fresh `QueryClientProvider` with retries disabled and zero GC time to prevent cross-test leakage. Returns both the render result and the `queryClient` instance.
- **TanStack Router mocking** -- `vi.mock('@tanstack/react-router')` with `useNavigate: () => vi.fn()`, `useSearch`, `useParams` as needed. Route-level `validateSearch` functions are exported and tested independently.
- **API mocking** -- `vi.mock('@typhoon/ui')` with `importActual` spread and `apiFetch: vi.fn()`. Mock implementations switch on URL pattern.
- **Chart components** -- mocked to simple `<div>` renders to avoid Recharts complexity in unit tests.
- **Radix Select** -- use `pointerEventsCheck: PointerEventsCheckLevel.Never` on `userEvent.setup()` when tests interact with Radix select components (they apply `pointer-events: none` during animation).
- **AlertDialog flows** -- trigger the dialog, assert it opens, click the confirm button, assert the mutation was called.
- **File upload** -- create `File` objects and simulate `input[type=file]` change events or FormData submission.

## Configuration

| Setting                 | Source                     | Default                 |
| ----------------------- | -------------------------- | ----------------------- |
| Dev server port         | `vite.config.ts`           | `5174`                  |
| API proxy target        | `API_PROXY_TARGET` env var | `http://localhost:5172` |
| Theme storage key       | `main.tsx` ThemeProvider   | `typhoon-admin-theme`      |
| Query stale time        | `main.tsx` QueryClient     | 30 seconds              |
| Query retry count       | `main.tsx` QueryClient     | 1                       |
| Refetch on window focus | `main.tsx` QueryClient     | Disabled                |

The Vite dev server proxies all `/api/*` requests to the API server, so the admin app and API share the same origin from the browser's perspective. This avoids CORS and allows session cookies to flow naturally.

## Dependencies

| Package                  | Purpose                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `@typhoon/ui`               | Shared component library (AppShell, DataTable, StatCard, StatusBadge, etc.) |
| `@typhoon/api-client`       | Centralized query keys and typed API helpers                                |
| `@typhoon/chat`             | DocumentViewerPanel for document content viewing                            |
| `@typhoon/evals`            | Scorer category definitions and normalization                               |
| `@typhoon/config`           | Shared TypeScript and Vite config, APP_ROLES constants                      |
| `@tanstack/react-router` | Client-side routing with type-safe search params                            |
| `@tanstack/react-query`  | Server state management, caching, mutations                                 |
| `@dnd-kit/react`         | Drag-and-drop file management in the file browser                           |
| `recharts`               | Charts (score trends, latency percentiles, token usage, sparklines)         |
| `lucide-react`           | Icons                                                                       |
| `better-auth`            | Auth client (OIDC via Dex in dev)                                           |

## Cross-References

- [Architecture](../../docs/architecture.md) -- system-wide architecture and data flow
- [API Reference](../../docs/api-reference.md) -- all API endpoints consumed by this app
- [Environment Variables](../../docs/environment-variables.md) -- full env var reference
- [Design](../../docs/design.md) -- UI/UX design system and conventions
- [Getting Started](../../docs/getting-started.md) -- first-time setup instructions
- [Evaluation](../../docs/evaluation/) -- scorer, dataset, and experiment design
