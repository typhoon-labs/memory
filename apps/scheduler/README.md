# @typhoon/scheduler

Cron scheduler that enqueues sync scan jobs based on sync target schedules and performs housekeeping tasks. Designed as a single-replica deployment.

## Architecture Context

The scheduler is a lightweight process that bridges time-based triggers and the BullMQ job system. It reads sync target cron schedules from PostgreSQL and uses the Croner library to fire at the right times, enqueuing `scan` jobs to the `sync` queue for the worker to consume. It also handles cleanup of stale failed job records.

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph LR
  PG[(PostgreSQL)] -->|read schedules| Scheduler["@typhoon/scheduler<br/>:5171"]
  Scheduler -->|enqueue scan jobs| Redis[(Redis)]
  Redis --> Worker["@typhoon/worker"]

  Scheduler -->|cleanup old records| PG
```

The scheduler is intentionally separate from the API server to ensure cron triggers fire reliably regardless of API server restarts, deployments, or scaling events.

See also: [Architecture overview](../../docs/architecture.md), [Ingestion pipeline](../../docs/ingestion-and-rag.md)

## Running

```bash
bun run dev       # Development with --watch
bun run start     # Production mode
```

Health endpoint: `http://localhost:5171/healthz`

## Internal Structure

```
src/
  index.ts                  Entry point: queue init, scheduler start, polling loop, shutdown
  services.ts               Composition root: wires SyncTargetRepo
  cron/
    sync-scheduler.ts       Core logic: cron job management, scan enqueue, retention cleanup
  infra/
    db.ts                   PostgreSQL connection (Drizzle + postgres.js)
    health.ts               Minimal Bun.serve health server for K8s probes
    queue.ts                BullMQ queue registry (sync queue only)
```

## Startup Sequence

1. **OpenTelemetry instrumentation** -- imported before all other modules
2. **Queue initialization** -- creates the `sync` BullMQ queue handle
3. **Initial schedule refresh** -- loads all active sync targets from PostgreSQL, creates Croner jobs
4. **Polling interval** -- starts a 60-second `setInterval` to refresh schedules
5. **Health server** -- starts on `HEALTH_PORT` (default 5171)

## How Scheduling Works

### Schedule Refresh Cycle

Every 60 seconds (and once at startup), the scheduler:

1. **Stops all existing cron jobs** -- calls `job.stop()` on every active Croner instance
2. **Queries active sync targets** -- `syncTargetRepo.listActive()` returns all targets where `isActive = true` and `cronSchedule` is set
3. **Creates new Croner jobs** -- one per target, using the target's `cronSchedule` field as the cron expression
4. **Logs next run times** -- each scheduled target logs its next fire time for debugging

This full-refresh approach is simple and correct: any sync target created, updated, or deleted via the API is picked up within 60 seconds.

### Cron Expressions

The scheduler uses [Croner](https://github.com/hexagon/croner) for cron expression parsing, which supports:

- Standard 5-field cron (`minute hour day month weekday`)
- 6-field cron with seconds (`second minute hour day month weekday`)
- Named months and weekdays (`JAN`, `MON`)
- Ranges, lists, steps (`1-5`, `1,3,5`, `*/15`)
- `L` (last day of month), `#` (nth weekday)

Example schedules from code-defined sync targets:

| Expression     | Meaning                                    |
| -------------- | ------------------------------------------ |
| `0 */6 * * *`  | Every 6 hours (default for Typhoon Documents) |
| `0 0 * * *`    | Daily at midnight                          |
| `*/30 * * * *` | Every 30 minutes                           |

### Scan Job Enqueue

When a cron job fires, it adds a `scan` job to the BullMQ `sync` queue:

```typescript
await syncQueue.add(
  'scan',
  { syncTargetId: target.id },
  {
    jobId: crypto.randomUUID(),
    priority: JOB_PRIORITY.CRON,
  },
);
```

- **Job ID** -- random UUID prevents deduplication conflicts
- **Priority** -- `JOB_PRIORITY.CRON` (lower priority than manual triggers from the API)

The scan job is then picked up by the sync worker, which lists files in the target and enqueues individual `process-file` / `delete-file` jobs.

## Failed Job Retention Cleanup

The scheduler runs a daily cleanup (via `setInterval`, started once on first refresh) that deletes archived failed job records older than 90 days from the `failed_jobs` table in PostgreSQL. This prevents unbounded table growth from the API's failed job archiver.

## Single-Replica Design

The scheduler is designed to run as exactly one replica. Running multiple replicas would cause duplicate scan job enqueues (one per replica per cron trigger). There is no distributed locking or leader election -- simplicity is preferred since the scheduler is stateless and lightweight.

For high availability:

- Use a Kubernetes `Deployment` with `replicas: 1` and a `RollingUpdate` strategy
- The health endpoint (`/healthz`) supports liveness and readiness probes
- If the scheduler goes down briefly, missed cron triggers simply skip that cycle; the next trigger fires normally
- Manual syncs triggered from the API UI are unaffected by scheduler availability

## Graceful Shutdown

On `SIGTERM` or `SIGINT`:

1. **Clears the 60-second polling interval** -- stops future refresh cycles
2. **Stops all Croner jobs** -- prevents any pending cron triggers from firing
3. **Clears the retention cleanup interval** -- stops the daily cleanup timer
4. **Closes the BullMQ sync queue** -- via registry shutdown
5. **Exits the process**

## Environment Variables

| Variable       | Default                                      | Description                                    |
| -------------- | -------------------------------------------- | ---------------------------------------------- |
| `REDIS_URL`    | `redis://localhost:6379`                     | BullMQ connection for enqueuing scan jobs      |
| `DATABASE_URL` | `postgresql://typhoon:typhoon@localhost:5432/typhoon` | PostgreSQL connection for reading sync targets |
| `LOG_LEVEL`    | `info`                                       | Logging verbosity                              |
| `HEALTH_PORT`  | `5171`                                       | Health server port for K8s probes              |

See also: [Full environment variable reference](../../docs/environment-variables.md)

## Operational Notes

- **Schedule propagation delay** -- changes to sync target schedules in the API take up to 60 seconds to propagate to the scheduler
- **Clock sensitivity** -- cron triggers depend on the system clock; ensure NTP is configured in production
- **Resource footprint** -- the scheduler is extremely lightweight (no embeddings, no LLM calls, minimal memory); a single small container is sufficient
- **Monitoring** -- watch for `Scheduler refresh failed` error logs, which indicate database connectivity issues. The scheduler continues retrying every 60 seconds.
- **Failed job cleanup** -- the 90-day retention is hardcoded; to change it, modify `sync-scheduler.ts`

## Dependencies

| Package                   | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `@typhoon/db`                | Database connection, SyncTargetRepo, failed_jobs schema  |
| `@typhoon/ingestion`         | Not used at runtime, but shared type for ScanJobData     |
| `@typhoon/queue`             | Queue registry, job priority constants, ScanJobData type |
| `@typhoon/logger`            | Structured logging                                       |
| `@typhoon/config`            | Shared configuration                                     |
| `@typhoon/telemetry`         | OpenTelemetry instrumentation                            |
| `croner`                  | Cron expression parsing and scheduling                   |
| `bullmq`                  | Job queue (enqueue only, no consumption)                 |
| `drizzle-orm`, `postgres` | Database ORM + driver                                    |
