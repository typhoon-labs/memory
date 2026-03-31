import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const resources = pgTable('resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  externalId: text('external_id').notNull().unique(),
  workingMemory: text('working_memory'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
