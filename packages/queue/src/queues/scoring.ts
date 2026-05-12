import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/** Create the BullMQ scoring queue for generic scorer execution (score-run jobs). */
export function createScoringQueue(connection: ConnectionOptions) {
  return new Queue('scoring', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 86400, count: 10000 }, // 24h — aggregate retries may re-read children values
      removeOnFail: { age: 60 * 60 * 24 * 3 }, // 3 days
    },
  });
}
