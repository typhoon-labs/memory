import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const metadataFieldGroups = pgTable('metadata_field_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  fields: jsonb('fields')
    .$type<
      Record<
        string,
        {
          type: 'string' | 'number' | 'boolean' | 'string[]';
          required?: boolean;
          default?: unknown;
          allowedValues?: unknown[];
          description?: string;
        }
      >
    >()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
