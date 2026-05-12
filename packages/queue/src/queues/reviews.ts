import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/** Create the BullMQ reviews queue for scoring preparation and aggregation. */
export function createReviewsQueue(connection: ConnectionOptions) {
  return new Queue('reviews', {
    connection,
    defaultJobOptions: {
      attempts: 5, // extra retries for persistence-critical aggregate jobs
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 3600, count: 5000 },
      removeOnFail: { age: 60 * 60 * 24 * 3 }, // 3 days
    },
  });
}
