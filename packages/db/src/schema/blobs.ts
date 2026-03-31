import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const skillBlobs = pgTable('skill_blobs', {
  hash: text('hash').primaryKey(),
  content: text('content').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
