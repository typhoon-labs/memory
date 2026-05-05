# @typhoon/queue

BullMQ job queue wrapper. Provides typed queue factories, a shared registry, and job data schemas for all background processing.

## Exports

| Export | Description |
|--------|-------------|
| `createQueueRegistry()` | Isolated registry for managing queue lifecycle (init, get, shutdown) |
| `createSyncQueue()` | Queue factory for sync jobs (scan, process-file, delete-file) |
| `createScoringQueue()` | Queue factory for automated scoring jobs |
| `createExperimentQueue()` | Queue factory for experiment evaluation jobs |
| `createReportsQueue()` | Queue factory for report generation jobs |
| `JOB_PRIORITY` | Priority constants for job scheduling |
| `makeJobId()` | Deterministic job ID generator for deduplication |

## Usage

```ts
import { createQueueRegistry } from '@typhoon/queue';

const registry = createQueueRegistry();
const syncQueue = registry.init('sync', process.env.REDIS_URL);

await syncQueue.add('scan', { syncTargetId: 'target-1', force: false });
```

## Queues

| Name | Job Types | Description |
|------|-----------|-------------|
| `sync` | `scan`, `process-file`, `delete-file` | Document ingestion pipeline |
| `scoring` | `score` | Automated response scoring |
| `experiments` | `experiment` | Dataset evaluation runs |
| `reports` | — | Report generation |

## Dependencies

`bullmq`
