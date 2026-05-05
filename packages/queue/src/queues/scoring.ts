import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/** Create the BullMQ scoring queue with retry and cleanup settings. */
export function createScoringQueue(connection: ConnectionOptions) {
  return new Queue('scoring', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 3600, count: 5000 },
      removeOnFail: { age: 60 * 60 * 24 * 3 }, // 3 days
    },
  });
}
