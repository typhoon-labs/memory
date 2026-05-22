import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { entityStatusEnum } from './agents';

export const promptBlocks = pgTable('prompt_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: entityStatusEnum('status').notNull().default('draft'),
  activeVersionId: uuid('active_version_id'),
  authorId: uuid('author_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const promptBlockVersions = pgTable('prompt_block_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  blockId: uuid('block_id')
    .notNull()
    .references(() => promptBlocks.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  content: text('content').notNull(),
  rules: jsonb('rules'),
  requestContextSchema: jsonb('request_context_schema'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  changeMessage: text('change_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
