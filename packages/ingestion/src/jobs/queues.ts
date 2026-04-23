import { createHash } from 'node:crypto';
import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

/**
 * Generate a deterministic, UUID-formatted job ID from input components.
 * Used for BullMQ dedup — same inputs always produce the same ID.
 */
export function makeJobId(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('\0')).digest('hex');
  // Format as UUID: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

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

/** Job priority levels. Lower number = higher priority in BullMQ. */
export const JOB_PRIORITY = {
  MANUAL: 1,
  UPLOAD: 2,
  CRON: 5,
} as const;

export interface ScanJobData {
  syncTargetId: string;
  force?: boolean;
}

export interface ProcessFileJobData {
  syncTargetId: string;
  documentId: string;
  sourceKey: string;
  sourceEtag: string;
  sourceType: string;
  sourceName?: string;
  isUpdate: boolean;
  syncJobId?: string;
}

export interface DeleteFileJobData {
  documentId: string;
  sourceKey?: string;
  sourceType?: string;
  syncTargetId?: string;
  syncJobId?: string;
}
