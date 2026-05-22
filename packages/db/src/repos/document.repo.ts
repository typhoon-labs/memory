import { and, sql as drizzleSql, eq, inArray, like, ne } from 'drizzle-orm';

import type { Db } from '../client';
import { documents } from '../schema/document';

export class DocumentRepo {
  constructor(private db: Db) {}

  /** Find a single document by ID. */
  async findById(id: string) {
    const [doc] = await this.db.select().from(documents).where(eq(documents.id, id));
    return doc ?? null;
  }

  /** List all documents. */
  async listAll() {
    return this.db.select().from(documents);
  }

  /** List documents filtered by sync target. */
  async listBySyncTarget(syncTargetId: string) {
    return this.db.select().from(documents).where(eq(documents.syncTargetId, syncTargetId));
  }

  /** Update a document and return the updated row. */
  async update(id: string, data: Record<string, unknown>) {
    const [updated] = await this.db
      .update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return updated ?? null;
  }

  /** Mark a document as deleted. */
  async markDeleted(id: string) {
    await this.db.update(documents).set({ status: 'deleted', updatedAt: new Date() }).where(eq(documents.id, id));
  }

  /** Mark a document as processing and clear its error message. */
  async markProcessing(id: string) {
    const [updated] = await this.db
      .update(documents)
      .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return updated ?? null;
  }

  /** Bulk mark documents as deleted. */
  async bulkMarkDeleted(ids: string[]) {
    if (ids.length === 0) return;
    await this.db.update(documents).set({ status: 'deleted', updatedAt: new Date() }).where(inArray(documents.id, ids));
  }

  /** Bulk update multiple documents with the same data. */
  async bulkUpdate(ids: string[], data: Record<string, unknown>) {
    if (ids.length === 0) return;
    await this.db
      .update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(inArray(documents.id, ids));
  }

  /** Find multiple documents by IDs. */
  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(documents).where(inArray(documents.id, ids));
  }

  /** List document IDs for a sync target. */
  async listIdsBySyncTargetId(syncTargetId: string) {
    return this.db.select({ id: documents.id }).from(documents).where(eq(documents.syncTargetId, syncTargetId));
  }

  /** List non-deleted documents for a sync target (id + sourceKey). */
  async listNonDeletedBySyncTargetId(syncTargetId: string) {
    return this.db
      .select({ id: documents.id, sourceKey: documents.sourceKey })
      .from(documents)
      .where(and(eq(documents.syncTargetId, syncTargetId), ne(documents.status, 'deleted')));
  }

  /** List non-deleted documents matching a source key prefix. */
  async listBySourceKeyPrefix(syncTargetId: string, prefix: string) {
    return this.db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.syncTargetId, syncTargetId),
          like(documents.sourceKey, `${prefix}%`),
          ne(documents.status, 'deleted'),
        ),
      );
  }

  /** Find documents by sync target and source keys. */
  async findBySyncTargetAndSourceKeys(syncTargetId: string, sourceKeys: string[]) {
    if (sourceKeys.length === 0) return [];
    return this.db
      .select()
      .from(documents)
      .where(and(eq(documents.syncTargetId, syncTargetId), inArray(documents.sourceKey, sourceKeys)));
  }

  /** Upsert a document by (syncTargetId, sourceKey) conflict. Returns the row. */
  async upsertBySourceKey(data: typeof documents.$inferInsert) {
    const [row] = await this.db
      .insert(documents)
      .values(data)
      .onConflictDoUpdate({
        target: [documents.syncTargetId, documents.sourceKey],
        set: {
          status: 'processing',
          errorMessage: null,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  /** Update a document's sourceKey by (syncTargetId, old sourceKey). Returns the updated row or null. */
  async updateSourceKey(syncTargetId: string, oldSourceKey: string, newSourceKey: string) {
    const [row] = await this.db
      .update(documents)
      .set({ sourceKey: newSourceKey, updatedAt: new Date() })
      .where(and(eq(documents.syncTargetId, syncTargetId), eq(documents.sourceKey, oldSourceKey)))
      .returning();
    return row ?? null;
  }

  /** Insert a new document and return the created row. */
  async create(data: {
    syncTargetId: string;
    sourceKey: string;
    sourceEtag?: string;
    fileSize?: number;
    status: 'pending' | 'processing' | 'ready' | 'error' | 'deleted';
    lastSyncedAt?: Date;
  }) {
    const [row] = await this.db.insert(documents).values(data).returning();
    return row;
  }

  /** Update a document by sourceKey for a sync operation. Returns the updated row or null. */
  async updateForSync(
    sourceKey: string,
    data: {
      sourceEtag?: string;
      status: 'pending' | 'processing' | 'ready' | 'error' | 'deleted';
      errorMessage?: string | null;
      lastSyncedAt?: Date;
      updatedAt?: Date;
    },
  ) {
    const [row] = await this.db.update(documents).set(data).where(eq(documents.sourceKey, sourceKey)).returning();
    return row ?? null;
  }

  /** Mark a document as ready with metadata from processing. */
  async markReady(
    id: string,
    data: {
      title?: string;
      description?: string;
      chunkCount?: number;
      customMetadata?: Record<string, unknown>;
      mimeType?: string;
    },
  ) {
    const [row] = await this.db
      .update(documents)
      .set({ ...data, status: 'ready' as const, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return row ?? null;
  }

  /** Mark a document as errored with an error message. */
  async markError(id: string, errorMessage: string) {
    await this.db
      .update(documents)
      .set({ status: 'error', errorMessage, updatedAt: new Date() })
      .where(eq(documents.id, id));
  }

  /** Bulk-mark ready documents as needing search meta refresh. */
  async markSearchMetaDirty(syncTargetIds: string[]) {
    if (syncTargetIds.length === 0) return;
    await this.db
      .update(documents)
      .set({ searchMetaDirty: true })
      .where(
        and(
          inArray(documents.syncTargetId, syncTargetIds),
          eq(documents.status, 'ready'),
          eq(documents.searchMetaDirty, false),
        ),
      );
  }

  /** Clear dirty flag after successful meta refresh or full reprocess. */
  async clearSearchMetaDirty(id: string) {
    await this.db.update(documents).set({ searchMetaDirty: false }).where(eq(documents.id, id));
  }

  /** Count documents with stale search meta for a sync target. */
  async countSearchMetaDirty(syncTargetId: string) {
    const rows = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.syncTargetId, syncTargetId), eq(documents.searchMetaDirty, true)));
    return rows.length;
  }

  /** Introspect distinct metadata keys and their value distributions. */
  async metadataFields(syncTargetId?: string) {
    const whereClause = syncTargetId
      ? drizzleSql`WHERE d.sync_target_id = ${syncTargetId} AND d.custom_metadata != '{}'::jsonb`
      : drizzleSql`WHERE d.custom_metadata != '{}'::jsonb`;

    const rows = await this.db.execute(drizzleSql`
      SELECT
        kv.key,
        jsonb_agg(DISTINCT kv.value) FILTER (WHERE jsonb_typeof(kv.value) != 'null') AS "values",
        COUNT(DISTINCT d.id)::int AS count
      FROM documents d,
           jsonb_each(d.custom_metadata) AS kv(key, value)
      ${whereClause}
        AND d.status != 'deleted'
      GROUP BY kv.key
      ORDER BY count DESC
    `);

    return (rows as unknown as Array<{ key: string; values: unknown[]; count: number }>).map((row) => ({
      key: row.key,
      values: row.values ?? [],
      count: row.count,
    }));
  }
}
