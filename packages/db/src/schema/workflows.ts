import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const workflowSnapshots = pgTable(
  'workflow_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workflowName: text('workflow_name').notNull(),
    runId: text('run_id').notNull(),
    resourceId: text('resource_id'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('workflow_snapshots_name_run_idx').on(table.workflowName, table.runId)],
);
