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
- Trace explorer with span waterfall view and filtering

## Dependencies

`@typhoon/ui` (component library), `@tanstack/react-router`, `@tanstack/react-query`, `@dnd-kit/*`

Connects to `@typhoon/api` endpoints.
