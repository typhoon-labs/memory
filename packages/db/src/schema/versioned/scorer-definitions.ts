import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { entityStatusEnum } from './agents.js';

export const scorerDefinitions = pgTable('scorer_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: entityStatusEnum('status').notNull().default('draft'),
  activeVersionId: uuid('active_version_id'),
  authorId: uuid('author_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const scorerDefinitionVersions = pgTable('scorer_definition_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  scorerDefinitionId: uuid('scorer_definition_id')
    .notNull()
    .references(() => scorerDefinitions.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  model: jsonb('model'),
  instructions: text('instructions'),
  scoreRange: jsonb('score_range'),
  presetConfig: jsonb('preset_config'),
  defaultSampling: jsonb('default_sampling'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  changeMessage: text('change_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
