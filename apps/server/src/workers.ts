import { createDb } from '@typhoon/db';
import { handleDeleteFileJob, handleProcessFileJob, handleScanJob } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { PgVector } from '@typhoon/pg';
import type { ConnectionOptions } from 'bullmq';
import { Worker } from 'bullmq';
import postgres from 'postgres';
import { getSyncQueue } from './queue.js';

const log = createAppLogger('worker');

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
    { connection, concurrency: 5 },
  );

  syncWorker.on('failed', (job, err) => {
    log.error('Job failed', { job: job?.name, jobId: job?.id, error: err.message });
  });

  syncWorker.on('completed', (job) => {
    log.debug('Job completed', { job: job.name, jobId: job.id });
  });

  return { syncWorker, syncQueue };
}
