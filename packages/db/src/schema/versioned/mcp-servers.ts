import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { entityStatusEnum } from './agents.js';

export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: entityStatusEnum('status').notNull().default('draft'),
  activeVersionId: uuid('active_version_id'),
  authorId: uuid('author_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const mcpServerVersions = pgTable('mcp_server_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  mcpServerId: uuid('mcp_server_id')
    .notNull()
    .references(() => mcpServers.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description'),
  instructions: text('instructions'),
  repository: jsonb('repository'),
  releaseDate: text('release_date'),
  isLatest: boolean('is_latest'),
  packageCanonical: text('package_canonical'),
  tools: jsonb('tools'),
  agents: jsonb('agents'),
  workflows: jsonb('workflows'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  changeMessage: text('change_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
