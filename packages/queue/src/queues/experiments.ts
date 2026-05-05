import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/** Create the BullMQ experiments queue. No auto-retry — experiments are expensive. */
export function createExperimentQueue(connection: ConnectionOptions) {
  return new Queue('experiments', {
    connection,
    defaultJobOptions: {
      attempts: 1, // experiments are expensive — no auto-retry
      removeOnComplete: { age: 86400, count: 100 }, // 24h
      removeOnFail: { age: 60 * 60 * 24 * 7 }, // 7 days
    },
  });
}
