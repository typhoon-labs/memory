import type { StatusBadgeVariant } from '@typhoon/ui';

export interface QueueSummary {
  name: string;
  isPaused: boolean;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    prioritized: number;
    'waiting-children': number;
  };
}

export interface QueueWorker {
  id: string;
  addr: string;
  name: string;
  age: number;
  idle: number;
}

export interface JobProgress {
  stage: string;
  startedAt: number;
}

/** Type guard for the structured progress payload our handlers emit. */
export function isStageProgress(p: QueueJob['progress']): p is JobProgress {
  return typeof p === 'object' && p !== null && typeof (p as JobProgress).stage === 'string';
}

export interface QueueJob {
  id: string;
  name: string;
  data: unknown;
  state: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
  returnvalue: unknown;
  stacktrace: string[];
  /** Live stage payload from `job.updateProgress()` in the worker handler. */
  progress: JobProgress | number | null;
}

export const JOB_STATES = ['all', 'failed', 'active', 'waiting', 'delayed', 'completed'] as const;
export type JobState = (typeof JOB_STATES)[number];

export const JOB_STATE_BADGE_MAP: Record<string, StatusBadgeVariant> = {
  waiting: 'pending',
  active: 'warning',
  completed: 'success',
  failed: 'error',
  delayed: 'info',
};

export function formatTimestamp(ts: number | null): string {
  if (!ts) return '\u2014';
  return new Date(ts).toLocaleString();
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function formatJobDuration(processedOn: number | null, finishedOn: number | null): string {
  if (!processedOn) return '\u2014';
  const end = finishedOn ?? Date.now();
  const ms = end - processedOn;
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
