# @typhoon/admin

Admin dashboard for document management, sync monitoring, queue inspection, and feedback review. Built with React 19 + Vite + TanStack Router.

## Running

```bash
bun run dev   # Development server
```

Default: `http://localhost:5174`

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with system overview and statistics |
| `/sources` | S3 source credential and sync target management |
| `/sources/$sourceId` | Source detail with tabs: Overview, Documents, Sync Logs |
| `/documents` | File browser with upload, deletion, and content viewing |
| `/reviews` | Conversation review and scoring |
| `/reviews/$threadId` | Review detail with annotation |
| `/datasets` | Dataset management |
| `/datasets/$datasetId` | Dataset detail |
| `/experiments` | Experiment listing |
| `/experiments/compare` | Experiment comparison (side-by-side) |
| `/experiments/$experimentId` | Experiment detail |
| `/scorers` | Scorer management |
| `/scorers/$scorerId` | Scorer detail and configuration |
| `/traces` | Trace explorer (filterable by status, entity type, thread) |
| `/traces/$traceId` | Trace detail with span waterfall |
| `/queues` | Job queue status overview |
| `/queues/$queueName` | Queue detail with job inspection and retry |
| `/login` | Authentication page |

## Deep Linking (URL State)

All meaningful UI state is persisted in URL search parameters so views are shareable and survive page refresh.

| Route | Params | Description |
|-------|--------|-------------|
| `/sources/$sourceId` | `tab`, `path` | Active tab and file path |
| `/documents` | `syncTargetId`, `status` | Source and status filters |
| `/reviews` | `sortBy`, `annotationStatus`, `feedbackStatus`, `search` | All filters (client-side pagination) |
| `/experiments` | `status` | Status filter |
| `/experiments/compare` | `a`, `b`, `item` | Experiment IDs + selected comparison item |
| `/experiments/$experimentId` | `result` | Selected result detail |
| `/scorers` | `status` | Status filter |
| `/scorers/$scorerId` | `tab` | Active tab |
| `/traces` | `status`, `entityType`, `search`, `threadId` | All filters |
| `/traces/$traceId` | `span` | Selected span ID (opens detail sheet) |
| `/queues/$queueName` | `tab`, `jobState` | Active tab and job state filter |

Example shareable URLs:
- `/reviews?sortBy=responseScore&annotationStatus=unannotated` — unannotated reviews sorted by response quality
- `/traces/abc123?span=span456` — trace with a specific span detail open
- `/experiments/compare?a=exp1&b=exp2&item=3` — comparison with item 3 selected

## Browser Tab Titles

Each page sets a dynamic `document.title` via `usePageTitle` and `detailTitle` from `src/hooks/use-page-title.ts`. The app suffix ("Typhoon Admin") and hierarchy separator (`:`) are defined as constants there.

- List pages: "Reviews - Typhoon Admin", "Traces - Typhoon Admin"
- Detail pages: "Datasets: My Dataset - Typhoon Admin", "Traces: a1b2c3d4 - Typhoon Admin"
- Compare page: "Experiments: Compare: Baseline vs Candidate - Typhoon Admin"

## Key Features

- Drag-and-drop file management (@dnd-kit)
- Real-time queue and sync job monitoring
- Document metadata and content viewing
- Sync job inspection with error details and retry
- Folder creation in sync targets
- Conversation review and annotation workflow with scoring
- Dataset management for evaluation
- Experiment creation, execution, and side-by-side comparison
- Scorer definition and configuration
- Trace explorer with span waterfall view, expand/collapse all, and filtering by name and span type

## Dependencies

`@typhoon/ui` (component library), `@tanstack/react-router`, `@tanstack/react-query`, `@dnd-kit/*`

Connects to `@typhoon/api` endpoints.
