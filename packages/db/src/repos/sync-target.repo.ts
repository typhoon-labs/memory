import { and, eq, inArray, notInArray } from 'drizzle-orm';

import type { Db } from '../client';
import { syncTargets } from '../schema/sync-target';

/** Data-access layer for the sync_targets table. */
export class SyncTargetRepo {
  constructor(private db: Db) {}

  /** Find a single sync target by ID. */
  async findById(id: string) {
    const [target] = await this.db.select().from(syncTargets).where(eq(syncTargets.id, id));
    return target ?? null;
  }

  /** Find multiple sync targets by IDs. */
  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(syncTargets).where(inArray(syncTargets.id, ids));
  }

  /** List all sync targets. */
  async listAll() {
    return this.db.select().from(syncTargets);
  }

  /** List active sync targets (isActive = true). */
  async listActive() {
    return this.db.select().from(syncTargets).where(eq(syncTargets.isActive, true));
  }

  /** Insert a new sync target and return the created row. */
  async create(data: typeof syncTargets.$inferInsert) {
    const [row] = await this.db.insert(syncTargets).values(data).returning();
    return row;
  }

  /** Update a sync target by ID and return the updated row (or null). */
  async update(id: string, data: Partial<typeof syncTargets.$inferInsert>) {
    const [row] = await this.db
      .update(syncTargets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(syncTargets.id, id))
      .returning();
    return row ?? null;
  }

  /** Delete a sync target by ID. */
  async delete(id: string) {
    await this.db.delete(syncTargets).where(eq(syncTargets.id, id));
  }

  /** Count sync targets referencing a given metadata template. */
  async countByMetadataTemplateId(templateId: string) {
    const rows = await this.db
      .select({ id: syncTargets.id })
      .from(syncTargets)
      .where(eq(syncTargets.metadataTemplateId, templateId));
    return rows.length;
  }

  /** Find sync targets referencing a given metadata template. */
  async findByMetadataTemplateId(templateId: string) {
    return this.db
      .select({ id: syncTargets.id })
      .from(syncTargets)
      .where(eq(syncTargets.metadataTemplateId, templateId));
  }

  /** Find sync targets referencing any of the given metadata templates. */
  async findByMetadataTemplateIds(templateIds: string[]) {
    if (templateIds.length === 0) return [];
    return this.db
      .select({ id: syncTargets.id })
      .from(syncTargets)
      .where(inArray(syncTargets.metadataTemplateId, templateIds));
  }

  /** Find a single sync target by name. */
  async findByName(name: string) {
    const [target] = await this.db.select().from(syncTargets).where(eq(syncTargets.name, name));
    return target ?? null;
  }

  /**
   * Deactivate config-managed sync targets whose names are not in `activeNames`.
   * Returns the names of deactivated targets.
   */
  async deactivateOrphaned(activeNames: string[]) {
    if (activeNames.length === 0) return [];
    const rows = await this.db
      .update(syncTargets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(syncTargets.managedBy, 'config'), notInArray(syncTargets.name, activeNames)))
      .returning({ name: syncTargets.name });
    return rows.map((r) => r.name);
  }
}
