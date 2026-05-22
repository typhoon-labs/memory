import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { syncTargets } from './sync-target';

export const documentStatusEnum = pgEnum('document_status', ['pending', 'processing', 'ready', 'error', 'deleted']);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    syncTargetId: uuid('sync_target_id')
      .notNull()
      .references(() => syncTargets.id, { onDelete: 'cascade' }),
    sourceKey: text('source_key').notNull(),
    sourceEtag: text('source_etag'),
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    title: text('title'),
    description: text('description'),
    author: text('author'),
    pageCount: integer('page_count'),
    status: documentStatusEnum('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    chunkCount: integer('chunk_count').notNull().default(0),
    customMetadata: jsonb('custom_metadata').$type<Record<string, unknown>>().notNull().default({}),
    contentHash: text('content_hash'),
    searchMetaDirty: boolean('search_meta_dirty').default(false).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('documents_sync_target_key_unique_idx').on(table.syncTargetId, table.sourceKey),
    index('documents_status_idx').on(table.status),
    index('documents_sync_target_id_idx').on(table.syncTargetId),
    index('documents_custom_metadata_idx').using('gin', table.customMetadata),
  ],
);
