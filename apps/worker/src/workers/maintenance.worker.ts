import { PartitionRepo } from '@typhoon/db/repos';
import { managePartitions } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import type { Worker } from 'bullmq';

import type { MaintenanceWorkerDeps } from './types';

const log = createAppLogger('worker');

/**
 * Creates the BullMQ Worker for the 'maintenance' queue.
 * Handles DB housekeeping jobs (partition management, etc.).
 * Always created — not conditional on any feature flag.
 */
export function createMaintenanceWorker(deps: MaintenanceWorkerDeps): Worker {
  const { redis, db, maintenanceQueue } = deps;
  const partitionRepo = new PartitionRepo(db);

  const worker = redis.createWorker(
    'maintenance',
    async (job) => {
      switch (job.name) {
        case 'partition-management': {
          const retDays = (job.data as { retentionDays?: number }).retentionDays ?? 90;
          const result = await managePartitions(partitionRepo, { retentionDays: retDays });
          log.info('Partition management complete', result);
          return result;
        }
        default:
          throw new Error(`Unknown maintenance job: ${job.name}`);
      }
    },
    { concurrency: 1 },
  );

  worker.on('error', (err) => {
    log.error('Maintenance worker error', { error: err.message });
  });
  worker.on('failed', (job, err) => {
    log.error('Maintenance job failed', { jobId: job?.id, name: job?.name, error: err.message });
  });

  // Register partition management as a repeatable job
  const retentionDays = Number(process.env.SPAN_RETENTION_DAYS ?? '90');
  maintenanceQueue
    .add('partition-management', { retentionDays }, { repeat: { pattern: '0 2 * * *' }, jobId: 'partition-mgmt' })
    .catch((err: unknown) => log.error('Failed to register partition management job', { error: err }));

  log.info('Maintenance worker started');

  return worker;
}
