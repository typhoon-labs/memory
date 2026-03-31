import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const datasets = pgTable('datasets', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  inputSchema: jsonb('input_schema'),
  groundTruthSchema: jsonb('ground_truth_schema'),
  requestContextSchema: jsonb('request_context_schema'),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const datasetItems = pgTable(
  'dataset_items',
  {
    id: uuid('id').defaultRandom().notNull(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    datasetVersion: integer('dataset_version').notNull(),
    validTo: integer('valid_to'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    input: jsonb('input').notNull(),
    groundTruth: jsonb('ground_truth'),
    requestContext: jsonb('request_context'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.datasetVersion] }),
    index('dataset_items_dataset_id_idx').on(table.datasetId),
  ],
);

export const datasetVersions = pgTable('dataset_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  datasetId: uuid('dataset_id')
    .notNull()
    .references(() => datasets.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
