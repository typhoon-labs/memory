import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/** Create the BullMQ sync queue with default retry, backoff, and cleanup settings. */
export function createSyncQueue(connection: ConnectionOptions) {
  return new Queue('sync', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 60 * 60 * 4 }, // 4 hours — failures are archived to PG
    },
  });
}

/** Create the BullMQ reports queue. */
export function createReportsQueue(connection: ConnectionOptions) {
  return new Queue('reports', { connection });
}
