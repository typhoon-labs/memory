import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Persistent archive of terminally failed BullMQ jobs. Written to by the API's
 * failed-job archiver on every `failed` QueueEvent. Unlike BullMQ's
 * `removeOnFail` TTL, these records persist indefinitely for audit/debugging.
 */
export const failedJobs = pgTable(
  'failed_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queue: text('queue').notNull(),
    jobName: text('job_name').notNull(),
    jobId: text('job_id').notNull(),
    data: jsonb('data'),
    failedReason: text('failed_reason'),
    stacktrace: text('stacktrace'),
    attemptsMade: integer('attempts_made').notNull().default(0),
    syncTargetId: uuid('sync_target_id'),
    documentId: uuid('document_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('failed_jobs_queue_idx').on(table.queue),
    index('failed_jobs_sync_target_id_idx').on(table.syncTargetId),
    index('failed_jobs_created_at_idx').on(table.createdAt),
  ],
);
