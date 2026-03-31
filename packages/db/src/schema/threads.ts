import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull().unique(),
    resourceId: text('resource_id').notNull(),
    title: text('title').default('').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('threads_resource_id_created_at_idx').on(table.resourceId, table.createdAt),
    index('threads_metadata_gin_idx').using('gin', table.metadata),
  ],
);
