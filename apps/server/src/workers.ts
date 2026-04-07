import { createDb } from '@typhoon/db';
import { handleDeleteFileJob, handleProcessFileJob, handleScanJob } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { PgVector } from '@typhoon/pg';
import type { ConnectionOptions } from 'bullmq';
import { Worker } from 'bullmq';
import postgres from 'postgres';
import { getSyncQueue } from './queue.js';

const log = createAppLogger('worker');

// Tracked at module scope so shutdownWorkers() can drain in-flight jobs
// gracefully on SIGTERM/SIGINT (see apps/server/src/index.ts).
const _workers = new Map<string, Worker>();

export function startWorkers(redisUrl: string, databaseUrl: string) {
  const connection: ConnectionOptions = { url: redisUrl };
  const workerSql = postgres(databaseUrl, {
    onnotice: (notice) => {
      log.debug(notice.message, { code: notice.code });
    },
  });
  const db = createDb(workerSql);
  const vectorStore = new PgVector({ id: 'typhoon-vectors', sql: workerSql });
  const syncQueue = getSyncQueue();

  const concurrency = Number(process.env.SYNC_WORKER_CONCURRENCY ?? '5');
  // 2 minutes. BullMQ's standard worker auto-renews the lock at lockDuration/2
  // (60s here), so as long as the event loop is responsive the lock is
  // continuously refreshed. When the worker dies (SIGKILL, OOM), the lock
  // expires within ~2 min and another worker claims the orphaned job —
  // 5x faster than the previous 10 min ceiling. Application-level hangs are
  // bounded separately by the per-stage withTimeout wrappers in the handlers.
  const lockDuration = Number(process.env.SYNC_WORKER_LOCK_DURATION_MS ?? String(2 * 60 * 1000));
  const stalledInterval = Number(process.env.SYNC_WORKER_STALLED_INTERVAL_MS ?? '60000');
  const maxStalledCount = Number(process.env.SYNC_WORKER_MAX_STALLED_COUNT ?? '3');

  // Per-stage timeouts inside the handlers (see packages/ingestion/src/util/
  // with-timeout.ts) are the real safety net. BullMQ's lockDuration provides
  // the ultimate stalled-job backstop. No need for an outer Promise.race here.
  const syncWorker = new Worker(
    'sync',
    async (job) => {
      switch (job.name) {
        case 'scan':
          return handleScanJob(job, db, syncQueue);
        case 'process-file':
          return handleProcessFileJob(job, db, vectorStore);
        case 'delete-file':
          return handleDeleteFileJob(job, db, vectorStore);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    { connection, concurrency, lockDuration, stalledInterval, maxStalledCount },
  );
  _workers.set('sync', syncWorker);

  log.info('Sync worker started', { concurrency, lockDuration, stalledInterval, maxStalledCount });

  syncWorker.on('error', (err) => {
    log.error('Worker connection error', { error: err.message });
  });

  syncWorker.on('failed', (job, err) => {
    log.error('Job failed', { job: job?.name, jobId: job?.id, error: err.message });
  });

  syncWorker.on('completed', (job) => {
    log.debug('Job completed', { job: job.name, jobId: job.id });
  });

  return { syncWorker, syncQueue };
}

/**
 * Gracefully closes all tracked workers. Each `worker.close()` waits for
 * in-flight jobs to finish, but the wait is capped at `gracefulMs` so a
 * stuck job can't block shutdown indefinitely. Called from the SIGTERM
 * handler in apps/server/src/index.ts before queues close.
 */
export async function shutdownWorkers(opts: { gracefulMs?: number } = {}): Promise<void> {
  const gracefulMs = opts.gracefulMs ?? 30_000;
  if (_workers.size === 0) return;

  log.info('Closing workers', { count: _workers.size, gracefulMs });
  await Promise.all(
    [..._workers.entries()].map(async ([name, worker]) => {
      try {
        await Promise.race([worker.close(), new Promise<void>((resolve) => setTimeout(resolve, gracefulMs))]);
      } catch (err) {
        log.error('Worker close error', { name, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  _workers.clear();
}
