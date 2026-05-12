import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const metadataTemplates = pgTable('metadata_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  /** Ordered list of metadata_field_groups UUIDs whose fields are merged into this template. */
  fieldGroupIds: jsonb('field_group_ids').$type<string[]>().notNull().default([]),
  /** Extra fields defined directly on this template (not from any group). */
  customFields: jsonb('custom_fields')
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
