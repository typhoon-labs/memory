import type { StatusBadgeVariant } from '@typhoon/ui';

export interface SyncTarget {
  id: string;
  name: string;
  sourceType: string;
  config: Record<string, unknown>;
  isActive: boolean;
  cronSchedule: string;
  managedBy: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  syncTargetId: string;
  status: 'running' | 'completed' | 'failed';
  filesScanned: number;
  filesNew: number;
  filesUpdated: number;
  filesDeleted: number;
  filesErrored: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface Document {
  id: string;
  syncTargetId: string;
  s3Key: string;
  s3Etag: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string | null;
  author: string | null;
  pageCount: number | null;
  status: 'pending' | 'processing' | 'ready' | 'parse_error' | 'embed_error' | 'deleted';
  errorMessage: string | null;
  chunkCount: number;
  contentHash: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const JOB_STATUS_MAP: Record<string, StatusBadgeVariant> = {
  running: 'warning',
  completed: 'success',
  failed: 'error',
};

export const DOC_STATUS_MAP: Record<string, StatusBadgeVariant> = {
  ready: 'success',
  processing: 'warning',
  pending: 'pending',
  parse_error: 'error',
  embed_error: 'error',
  deleted: 'pending',
};

export function formatConfig(sourceType: string, config: Record<string, unknown>): string {
  if (sourceType === 's3') {
    const bucket = config.bucket as string;
    const prefix = (config.prefix as string) ?? '';
    return `s3://${bucket}/${prefix}`;
  }
  return JSON.stringify(config);
}

export function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return 'Running...';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
