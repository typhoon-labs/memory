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
  metadataTemplateId: string | null;
  autoExtractMetadata: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  syncTargetId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  filesScanned: number;
  filesNew: number;
  filesUpdated: number;
  filesDeleted: number;
  filesErrored: number;
  childJobsTotal: number;
  childJobsCompleted: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface Document {
  id: string;
  syncTargetId: string;
  sourceKey: string;
  sourceEtag: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string | null;
  description: string | null;
  author: string | null;
  pageCount: number | null;
  status: 'pending' | 'processing' | 'ready' | 'error' | 'deleted';
  errorMessage: string | null;
  chunkCount: number;
  customMetadata: Record<string, unknown>;
  contentHash: string | null;
  searchMetaDirty: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const JOB_STATUS_MAP: Record<string, StatusBadgeVariant> = {
  running: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'pending',
};

export const DOC_STATUS_MAP: Record<string, StatusBadgeVariant> = {
  ready: 'success',
  processing: 'warning',
  pending: 'pending',
  error: 'error',
  deleted: 'pending',
};

export function formatConfig(sourceType: string, config: Record<string, unknown>, sourceBucket?: string): string {
  if (sourceType === 's3') {
    const bucket = sourceBucket ?? 'unknown';
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

export function formatCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes: */N * * * *
  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '*') return 'Every minute';
    const match = minute?.match(/^\*\/(\d+)$/);
    if (match?.[1]) {
      const n = Number(match[1]);
      return n === 1 ? 'Every minute' : `Every ${n} minutes`;
    }
  }

  // Every N hours: 0 */N * * * or specific minute
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const hourMatch = hour?.match(/^\*\/(\d+)$/);
    if (hourMatch?.[1]) {
      const n = Number(hourMatch[1]);
      return n === 1 ? 'Every hour' : `Every ${n} hours`;
    }
    // Daily at specific time: 0 8 * * *
    if (hour !== '*' && !hour?.includes('/') && !hour?.includes(',')) {
      const h = Number(hour);
      const m = Number(minute);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `Daily at ${h12}:${String(m).padStart(2, '0')} ${period}`;
      }
    }
  }

  return cron;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
