import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

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

export interface ScoringJobData {
  /** `messages.externalId` of the assistant message to score. */
  messageId: string;
  /** `threads.externalId` of the containing thread. */
  threadId: string;
  /** Agent that produced the response. */
  agentId: string;
  /** OTel traceId captured at request time, if available. */
  traceId: string | null;
}
