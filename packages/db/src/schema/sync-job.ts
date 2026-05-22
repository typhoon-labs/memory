import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { syncTargets } from './sync-target';

export const syncJobStatusEnum = pgEnum('sync_job_status', ['running', 'completed', 'failed', 'cancelled']);

export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    syncTargetId: uuid('sync_target_id')
      .notNull()
      .references(() => syncTargets.id, { onDelete: 'cascade' }),
    status: syncJobStatusEnum('status').notNull().default('running'),
    filesScanned: integer('files_scanned').notNull().default(0),
    filesNew: integer('files_new').notNull().default(0),
    filesUpdated: integer('files_updated').notNull().default(0),
    filesDeleted: integer('files_deleted').notNull().default(0),
    filesErrored: integer('files_errored').notNull().default(0),
    childJobsTotal: integer('child_jobs_total').notNull().default(0),
    childJobsCompleted: integer('child_jobs_completed').notNull().default(0),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('sync_jobs_sync_target_id_idx').on(table.syncTargetId),
    index('sync_jobs_status_idx').on(table.status),
  ],
);
