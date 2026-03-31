import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { entityStatusEnum } from './agents.js';

export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: entityStatusEnum('status').notNull().default('draft'),
  activeVersionId: uuid('active_version_id'),
  authorId: uuid('author_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const skillVersions = pgTable('skill_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id')
    .notNull()
    .references(() => skills.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  instructions: text('instructions').notNull(),
  license: text('license'),
  compatibility: jsonb('compatibility'),
  source: jsonb('source'),
  references: jsonb('references'),
  scripts: jsonb('scripts'),
  assets: jsonb('assets'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  tree: jsonb('tree'),
  changedFields: jsonb('changed_fields').$type<string[]>(),
  changeMessage: text('change_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
