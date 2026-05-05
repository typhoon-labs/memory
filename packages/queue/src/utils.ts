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
  MANUAL: 1,
  UPLOAD: 2,
  CRON: 5,
} as const;
