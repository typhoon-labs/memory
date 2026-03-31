import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const entityStatusEnum = pgEnum('entity_status', ['draft', 'active', 'archived']);

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: entityStatusEnum('status').notNull().default('draft'),
  activeVersionId: uuid('active_version_id'),
  authorId: uuid('author_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentVersions = pgTable('agent_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  instructions: text('instructions').notNull(),
  model: jsonb('model').notNull(),
  tools: jsonb('tools'),
  defaultOptions: jsonb('default_options'),
  workflows: jsonb('workflows'),
  agents: jsonb('agents'),
  integrationTools: jsonb('integration_tools'),
  inputProcessors: jsonb('input_processors'),
  outputProcessors: jsonb('output_processors'),
  memory: jsonb('memory'),
  scorers: jsonb('scorers'),
  mcpClients: jsonb('mcp_clients'),
  requestContextSchema: jsonb('request_context_schema'),
  workspace: jsonb('workspace'),
  skills: jsonb('skills'),
  skillsFormat: text('skills_format'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  changeMessage: text('change_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
