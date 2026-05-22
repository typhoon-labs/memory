import { DocumentRepo, MetadataRepo, SyncJobRepo, SyncTargetRepo } from '@typhoon/db/repos';
import { handleDeleteFileJob, handleProcessFileJob, handleScanJob, incrementSyncJobCompletion } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import type { Worker } from 'bullmq';

import type { SyncWorkerDeps } from './types';

const log = createAppLogger('worker');

/**
 * Creates the BullMQ Worker for the 'sync' queue.
 * Handles scan, process-file, and delete-file jobs.
 */
export function createSyncWorker(deps: SyncWorkerDeps): Worker {
  const { redis, db, sql, vectorStore, syncQueue } = deps;

  const repos = {
    syncTargetRepo: new SyncTargetRepo(db),
    syncJobRepo: new SyncJobRepo(db),
    documentRepo: new DocumentRepo(db),
    metadataRepo: new MetadataRepo(db),
  };

  const concurrency = Number(process.env.SYNC_WORKER_CONCURRENCY ?? '5');
  const lockDuration = Number(process.env.SYNC_WORKER_LOCK_DURATION_MS ?? String(2 * 60 * 1000));
  const stalledInterval = Number(process.env.SYNC_WORKER_STALLED_INTERVAL_MS ?? '60000');
  const maxStalledCount = Number(process.env.SYNC_WORKER_MAX_STALLED_COUNT ?? '3');

  const syncWorker = redis.createWorker(
    'sync',
    async (job) => {
      switch (job.name) {
        case 'scan':
          return handleScanJob(job, repos, syncQueue);
        case 'process-file':
          return handleProcessFileJob(job, repos, vectorStore, sql);
        case 'delete-file':
          return handleDeleteFileJob(job, repos, vectorStore);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    {
      concurrency,
      lockDuration,
      stalledInterval,
      maxStalledCount,
      limiter: {
        max: Number(process.env.SYNC_QUEUE_RATE_MAX ?? '10'),
        duration: Number(process.env.SYNC_QUEUE_RATE_DURATION_MS ?? '1000'),
      },
    },
  );

  log.info('Sync worker started', { concurrency, lockDuration, stalledInterval, maxStalledCount });

  syncWorker.on('error', (err) => {
    log.error('Worker connection error', { error: err.message });
  });

  syncWorker.on('failed', (job, err) => {
    log.error('Job failed', { job: job?.name, jobId: job?.id, error: err.message });
    const syncJobId = (job?.data as { syncJobId?: string } | undefined)?.syncJobId;
    if (syncJobId) {
      incrementSyncJobCompletion(repos.syncJobRepo, syncJobId, true).catch((err: unknown) => {
        log.error('Failed to increment sync job completion', {
          syncJobId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  });

  syncWorker.on('completed', (job) => {
    log.debug('Job completed', { job: job.name, jobId: job.id });
  });

  return syncWorker;
}
