import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';

export function createSyncQueue(connection: ConnectionOptions) {
  return new Queue('sync', { connection });
}

export function createReportsQueue(connection: ConnectionOptions) {
  return new Queue('reports', { connection });
}

export interface ScanJobData {
  syncTargetId: string;
}

export interface ProcessFileJobData {
  syncTargetId: string;
  documentId: string;
  s3Key: string;
  s3Etag: string;
  bucketName: string;
  sourceName?: string;
  isUpdate: boolean;
}

export interface DeleteFileJobData {
  documentId: string;
}
