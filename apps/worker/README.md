# @typhoon/worker

Headless BullMQ job consumer for Typhoon. Processes document ingestion, AI-powered scoring, conversation reviews, evaluation experiments, and database maintenance across five dedicated worker pools. Designed for horizontal scaling.

## Architecture Context

The worker is a background process that consumes jobs enqueued by the API server and scheduler. It has no HTTP routes (aside from a health probe) and no direct user interaction. Multiple replicas can run concurrently -- BullMQ distributes jobs across all connected consumers on the same Redis instance.

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph LR
  API["@typhoon/api"] -->|enqueue| Redis[(Redis)]
  Scheduler["@typhoon/scheduler"] -->|enqueue| Redis

  Redis --> SyncW["Sync Worker<br/>scan, process-file,<br/>delete-file"]
  Redis --> ReviewsW["Reviews Worker<br/>score-message,<br/>score-aggregate"]
  Redis --> MaintenanceW["Maintenance Worker<br/>partition-management"]
  Redis --> ScoringW["Scoring Worker<br/>score-run"]
  Redis --> ExperimentsW["Experiments Worker<br/>experiment-setup,<br/>exp-item-process,<br/>experiment-complete"]

  SyncW --> PG[(PostgreSQL<br/>+ pgvector)]
  SyncW --> S3[(MinIO / S3)]
  ReviewsW --> PG
  ScoringW --> PG
  ScoringW --> LLM[LLM API]
  ExperimentsW --> PG
  ExperimentsW --> LLM
```

See also: [Architecture overview](../../docs/architecture.md), [Ingestion pipeline](../../docs/ingestion-and-rag.md), [Evaluation system](../../docs/evaluation/)

## Running

```bash
bun run dev       # Development with --watch
bun run start     # Production mode
```

Health endpoint: `http://localhost:5170/healthz`

## Internal Structure

```
src/
  index.ts                  Entry point: source registration, queue init, worker start, shutdown
  services.ts               Composition root: wires repos + ScoringService for worker use
  config/
    sources.ts              Credential source registration (S3/MinIO)
  infra/
    db.ts                   PostgreSQL connection (Drizzle + postgres.js)
    health.ts               Minimal Bun.serve health server for K8s probes
    init.ts                 Startup: vector index init + tsvector backfill
    queue.ts                BullMQ queue registry (sync, scoring, reviews, experiments, maintenance)
  workers/
    index.ts                Worker orchestrator: starts all pools, manages scorer cache, shutdown
    types.ts                TypeScript interfaces for worker dependency injection
    sync.worker.ts          Sync queue consumer (scan, process-file, delete-file)
    reviews.worker.ts       Reviews queue consumer (score-message, score-aggregate)
    scoring.worker.ts       Scoring queue consumer (score-run)
    experiments.worker.ts   Experiments queue consumer (experiment-setup, exp-item-process, experiment-complete)
    maintenance.worker.ts   Maintenance queue consumer (partition-management)
```

## Startup Sequence

1. **OpenTelemetry instrumentation** -- imported before all other modules
2. **Source registration** -- registers S3/MinIO credential sources
3. **Vector index initialization** -- ensures `knowledge_base` HNSW index exists; backfills tsvector
4. **Queue initialization** -- creates 4 BullMQ queue handles: `sync`, `scoring`, `reviews`, `experiments`
5. **Worker start** -- creates a dedicated postgres connection pool, instantiates all worker pools
6. **Health server** -- starts on `HEALTH_PORT` (default 5170)

## Worker Pools

### Sync Worker (queue: `sync`)

Handles document ingestion from S3/MinIO sources.

| Job Name       | Enqueued By                            | Description                                                                       |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `scan`         | API (manual trigger), Scheduler (cron) | Lists files in a sync target, enqueues process-file/delete-file jobs for each     |
| `process-file` | scan job                               | Downloads file from S3, parses, chunks, embeds, upserts vectors + document record |
| `delete-file`  | scan job                               | Removes document record and associated vector chunks                              |

Configuration:

| Env Var                           | Default          | Description                              |
| --------------------------------- | ---------------- | ---------------------------------------- |
| `SYNC_WORKER_CONCURRENCY`         | `5`              | Concurrent jobs per replica              |
| `SYNC_WORKER_LOCK_DURATION_MS`    | `120000` (2 min) | BullMQ lock duration per job             |
| `SYNC_WORKER_STALLED_INTERVAL_MS` | `60000` (1 min)  | How often to check for stalled jobs      |
| `SYNC_WORKER_MAX_STALLED_COUNT`   | `3`              | Max times a job can stall before failing |
| `SYNC_QUEUE_RATE_MAX`             | `10`             | Max jobs per rate window                 |
| `SYNC_QUEUE_RATE_DURATION_MS`     | `1000`           | Rate limit window (ms)                   |

### Reviews Worker (queue: `reviews`)

Handles conversation scoring. Only starts when `SCORING_ENABLED` is set.

| Job Name          | Enqueued By                          | Description                                                                           |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `score-message`   | API ChatService (on chat completion) | Loads thread context, prepares scoring, creates a BullMQ Flow with score-run children |
| `score-aggregate` | score-message (as Flow parent)       | Collects results from score-run children, logs summary                                |

Configuration:

| Env Var               | Default | Description                         |
| --------------------- | ------- | ----------------------------------- |
| `SCORING_CONCURRENCY` | `5`     | Concurrent reviews jobs per replica |

Lock duration: 5 minutes. Stalled interval: 2.5 minutes. Max stalled count: 2.

### Scoring Worker (queue: `scoring`)

Executes individual scorer definitions against message content. Only starts when `SCORING_ENABLED` is set.

| Job Name    | Enqueued By                                        | Description                                                 |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------- |
| `score-run` | Reviews worker (Flow children), Experiments worker | Runs a single scorer (LLM-as-judge) and persists the result |

Configuration:

| Env Var                   | Default | Description                                |
| ------------------------- | ------- | ------------------------------------------ |
| `SCORING_RUN_CONCURRENCY` | `10`    | Concurrent scoring jobs per replica        |
| `SCORING_RUN_RATE_MAX`    | `15`    | Max scoring jobs per second (rate limiter) |

Lock duration: 5 minutes. Stalled interval: 2.5 minutes. Max stalled count: 2.

### Experiments Worker (queue: `experiments`)

Runs evaluation experiments: sends dataset items through the agent and scores responses.

| Job Name              | Enqueued By                         | Description                                                                             |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `experiment-setup`    | API ExperimentService               | Loads dataset items, creates Flow with exp-item-process children                        |
| `exp-item-process`    | experiment-setup (as Flow children) | Two-step: (1) call agent + enqueue score-run children, (2) collect scores + save result |
| `experiment-complete` | experiment-setup (as Flow parent)   | Collects all item results, marks experiment complete                                    |

Configuration:

| Env Var                   | Default | Description                            |
| ------------------------- | ------- | -------------------------------------- |
| `EXPERIMENTS_CONCURRENCY` | `3`     | Concurrent experiment jobs per replica |

Lock duration: 10 minutes. Stalled interval: 5 minutes. Max stalled count: 1.

### Maintenance Worker (queue: `maintenance`)

Handles database housekeeping jobs. **Always active** -- not conditional on `SCORING_ENABLED` or any other feature flag.

| Job Name               | Enqueued By                              | Description                                                           |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `partition-management` | Self-registered repeatable (daily 02:00) | Creates/drops monthly PostgreSQL partitions for the `ai_spans` table |

The partition manager creates future partitions (next month) and drops old partitions beyond the retention window.

Configuration:

| Env Var               | Default | Description                         |
| --------------------- | ------- | ----------------------------------- |
| `SPAN_RETENTION_DAYS` | `90`    | Days to retain telemetry partitions |

Concurrency: 1. This is a serial queue -- only one maintenance job runs at a time.

## BullMQ Flow Pattern

The scoring and experiment pipelines use BullMQ Flows (parent-children dependency trees) to fan out work to the scoring queue and collect results. This diagram shows the scoring flow triggered by a chat completion:

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TD
  Chat["Chat completes"] -->|enqueue| SM["score-message<br/>(reviews queue)"]
  SM -->|FlowProducer.add| SA["score-aggregate<br/>(reviews queue)<br/>PARENT"]
  SA -.->|waits for children| SR1["score-run: faithfulness<br/>(scoring queue)"]
  SA -.->|waits for children| SR2["score-run: relevance<br/>(scoring queue)"]
  SA -.->|waits for children| SR3["score-run: completeness<br/>(scoring queue)"]

  SR1 -->|persist| PG[(scores table)]
  SR2 -->|persist| PG
  SR3 -->|persist| PG
  SA -->|collect & log| Done["Scoring complete"]
```

The experiment flow follows a similar pattern but adds an extra level: `experiment-setup` creates `exp-item-process` children (one per dataset item), each of which dynamically adds `score-run` children to the scoring queue and uses `WaitingChildrenError` to pause until scoring completes.

## Scorer Definition Cache

Scorer definitions (LLM prompt templates + configuration) are loaded from PostgreSQL and cached in memory with a 5-minute TTL. The cache is shared across all worker pools in the same process and refreshed before each scoring batch. This avoids per-job database queries while keeping definitions reasonably fresh.

## Composition Root (services.ts)

The worker creates its own database connection (separate from the API) and wires:

- `ScoringService` -- with `MessageRepo`, `ThreadRepo`, `ScoreRepo`, and `PgVector`
- `PgVector` -- for vector store operations during sync processing

Additional repos (`SyncTargetRepo`, `SyncJobRepo`, `DocumentRepo`, `MetadataRepo`, `ScorerRepo`, `PartitionRepo`, `ExperimentRepo`) are instantiated directly in each worker's factory function.

## Environment Variables

| Variable                          | Default                                      | Description                                     |
| --------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `REDIS_URL`                       | `redis://localhost:6379`                     | BullMQ connection                               |
| `DATABASE_URL`                    | `postgresql://typhoon:typhoon@localhost:5432/typhoon` | PostgreSQL connection                           |
| `S3_ENDPOINT`                     | `http://localhost:9000`                      | MinIO/S3 endpoint                               |
| `S3_REGION`                       | `us-east-1`                                  | S3 region                                       |
| `S3_ACCESS_KEY`                   | (empty)                                      | S3 access key                                   |
| `S3_SECRET_KEY`                   | (empty)                                      | S3 secret key                                   |
| `EMBEDDING_*`                     | (varies)                                     | Embedding model configuration                   |
| `LLM_METADATA_EXTRACTION_MODEL`   | (varies)                                     | Model for title/description/metadata extraction |
| `SCORING_ENABLED`                 | `true`                                       | Enable reviews + scoring workers                |
| `SYNC_WORKER_CONCURRENCY`         | `5`                                          | Sync worker concurrency                         |
| `SYNC_WORKER_LOCK_DURATION_MS`    | `120000`                                     | Sync job lock duration                          |
| `SYNC_WORKER_STALLED_INTERVAL_MS` | `60000`                                      | Sync stalled check interval                     |
| `SYNC_WORKER_MAX_STALLED_COUNT`   | `3`                                          | Sync max stalled count                          |
| `SYNC_QUEUE_RATE_MAX`             | `10`                                         | Sync rate limiter max per window                |
| `SYNC_QUEUE_RATE_DURATION_MS`     | `1000`                                       | Sync rate limiter window                        |
| `SCORING_CONCURRENCY`             | `5`                                          | Reviews worker concurrency                      |
| `SCORING_RUN_CONCURRENCY`         | `10`                                         | Scoring worker concurrency                      |
| `SCORING_RUN_RATE_MAX`            | `15`                                         | Scoring rate limiter max per second             |
| `EXPERIMENTS_CONCURRENCY`         | `3`                                          | Experiments worker concurrency                  |
| `SPAN_RETENTION_DAYS`             | `90`                                         | Telemetry partition retention                   |
| `HEALTH_PORT`                     | `5170`                                       | Health server port                              |
| `LOG_LEVEL`                       | `info`                                       | Logging verbosity                               |

See also: [Full environment variable reference](../../docs/environment-variables.md)

## Graceful Shutdown

On `SIGTERM` or `SIGINT`, the worker performs an orderly shutdown:

1. **Worker drain** -- calls `worker.close()` on all 4 pools concurrently, which waits for in-flight jobs to complete
2. **Drain timeout** -- each worker has a 30-second grace period (`gracefulMs`); if a job is stuck, shutdown proceeds after the timeout
3. **Queue close** -- closes all BullMQ queue handles via registry shutdown
4. **Process exit** -- exits with code 0

This ensures no job data is lost: BullMQ automatically returns timed-out jobs to the queue for reprocessing by another replica.

## Scaling Guide

The worker is designed for horizontal scaling:

- **Multiple replicas** -- deploy via K8s HPA, KEDA, or simple container scaling. Each replica registers as a consumer on the same Redis queues.
- **Per-queue concurrency** -- tune `*_CONCURRENCY` env vars based on available CPU/memory per replica. Sync jobs are I/O-bound (S3 downloads, embeddings), scoring jobs are LLM-bound.
- **Rate limiting** -- `SYNC_QUEUE_RATE_MAX` and `SCORING_RUN_RATE_MAX` protect upstream services (S3, LLM APIs) from burst traffic. These are per-replica limits.
- **Stalled job recovery** -- BullMQ automatically detects and re-queues stalled jobs (configurable via `*_STALLED_INTERVAL_MS` and `*_MAX_STALLED_COUNT`).
- **Selective scaling** -- In production, consider running separate replica groups for sync vs. scoring workloads with different concurrency settings, or use BullMQ's named processor pattern.
- **Scoring toggle** -- set `SCORING_ENABLED=false` to run sync-only workers (e.g., during bulk ingestion).

## Dependencies

| Package                   | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `@typhoon/ai`                | Embedding model, scoring model, metadata extraction model     |
| `@typhoon/agents`            | Experiment agent creation                                     |
| `@typhoon/config`            | Feature flags (scoring enabled)                               |
| `@typhoon/db`                | Database layer, repos, Drizzle storage adapters               |
| `@typhoon/evals`             | Scorer execution, experiment lifecycle                        |
| `@typhoon/ingestion`         | Scan, process-file, delete-file handlers; source registration |
| `@typhoon/queue`             | Queue registry, job data types                                |
| `@typhoon/services`          | ScoringService                                                |
| `@typhoon/telemetry`         | OpenTelemetry instrumentation                                 |
| `@typhoon/logger`            | Structured logging                                            |
| `@mastra/core`            | Mastra instance (experiments only)                            |
| `bullmq`                  | Job queue framework                                           |
| `drizzle-orm`, `postgres` | Database ORM + driver                                         |
