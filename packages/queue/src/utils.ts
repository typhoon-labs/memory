import { createHash } from 'node:crypto';

/**
 * Generate a deterministic, UUID-formatted job ID from input components.
 * Used for BullMQ dedup — same inputs always produce the same ID.
 */
export function makeJobId(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('\0')).digest('hex');
  // Format as UUID: 8-4-4-4-12
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Job priority levels. Lower number = higher priority in BullMQ. */
export const JOB_PRIORITY = {
  /** User-initiated scan. Highest priority. */
  MANUAL: 1,
  /** Direct file upload (not from scan). */
  UPLOAD: 2,
  /** Scheduled (cron) scan. */
  CRON: 3,
  /** Child jobs (process-file, delete-file) spawned by a manual scan. */
  CHILD_MANUAL: 10,
  /** Child jobs spawned by a cron scan. */
  CHILD_CRON: 15,
} as const;

/**
 * Map a scan job's priority to the priority its child jobs should use.
 * Child jobs always run at lower priority than any scan, so a new scan
 * from another source can jump ahead of an existing source's file backlog.
 */
export function childPriorityFor(scanPriority: number | undefined): number {
  if (scanPriority === JOB_PRIORITY.MANUAL) return JOB_PRIORITY.CHILD_MANUAL;
  if (scanPriority === JOB_PRIORITY.CRON) return JOB_PRIORITY.CHILD_CRON;
  return JOB_PRIORITY.CHILD_CRON;
}
