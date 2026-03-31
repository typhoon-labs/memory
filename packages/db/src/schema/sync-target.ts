import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const syncTargets = pgTable(
  'sync_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    sourceType: text('source_type').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    cronSchedule: text('cron_schedule').notNull().default('0 */6 * * *'),
    isActive: boolean('is_active').notNull().default(true),
    managedBy: text('managed_by'),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('sync_targets_is_active_idx').on(table.isActive),
    index('sync_targets_source_type_idx').on(table.sourceType),
    uniqueIndex('sync_targets_name_managed_by_idx').on(table.name, sql`COALESCE(${table.managedBy}, 'manual')`),
  ],
);
