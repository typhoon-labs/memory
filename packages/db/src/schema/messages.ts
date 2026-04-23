import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { threads } from './threads';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull().unique(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    type: text('type').default('text').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    resourceId: text('resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('messages_thread_id_created_at_idx').on(table.threadId, table.createdAt)],
);
