import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { entityStatusEnum } from './agents';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: entityStatusEnum('status').notNull().default('draft'),
  activeVersionId: uuid('active_version_id'),
  authorId: uuid('author_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceVersions = pgTable('workspace_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  filesystem: jsonb('filesystem'),
  sandbox: jsonb('sandbox'),
  mounts: jsonb('mounts'),
  search: jsonb('search'),
  skills: jsonb('skills'),
  tools: jsonb('tools'),
  autoSync: boolean('auto_sync'),
  operationTimeout: integer('operation_timeout'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  changeMessage: text('change_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
