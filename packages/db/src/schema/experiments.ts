import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const experimentStatusEnum = pgEnum('experiment_status', ['pending', 'running', 'completed', 'failed']);

export const experiments = pgTable('experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  datasetId: text('dataset_id'),
  datasetVersion: integer('dataset_version'),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  status: experimentStatusEnum('status').notNull(),
  totalItems: integer('total_items').notNull().default(0),
  succeededCount: integer('succeeded_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const experimentResults = pgTable(
  'experiment_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    itemDatasetVersion: integer('item_dataset_version'),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    groundTruth: jsonb('ground_truth'),
    error: jsonb('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    retryCount: integer('retry_count').notNull().default(0),
    traceId: text('trace_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('experiment_results_experiment_id_idx').on(table.experimentId)],
);
