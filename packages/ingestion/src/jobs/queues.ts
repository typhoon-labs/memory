import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

export function createSyncQueue(connection: ConnectionOptions) {
  return new Queue('sync', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  });
}

export function createReportsQueue(connection: ConnectionOptions) {
  return new Queue('reports', { connection });
}

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
}

export interface DeleteFileJobData {
  documentId: string;
  sourceKey?: string;
  sourceType?: string;
  syncTargetId?: string;
}
