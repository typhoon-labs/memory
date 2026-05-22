import { and, count, desc, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { threads } from '../schema/threads';

export class ThreadRepo {
  constructor(private db: Db) {}

  /** Resolve a thread external ID to its internal ID. */
  async findByExternalId(externalId: string) {
    const [thread] = await this.db.select({ id: threads.id }).from(threads).where(eq(threads.externalId, externalId));
    return thread ?? null;
  }

  /** Fetch a full thread row by externalId, optionally scoped to a resourceId. */
  async findFullByExternalId(externalId: string, resourceId?: string) {
    const conditions = [eq(threads.externalId, externalId)];
    if (resourceId) conditions.push(eq(threads.resourceId, resourceId));

    const [thread] = await this.db
      .select()
      .from(threads)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions));
    return thread ?? null;
  }

  /** List threads for a specific user with pagination. */
  async listByResourceId(
    resourceId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ rows: (typeof threads.$inferSelect)[]; total: number }> {
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(threads)
        .where(eq(threads.resourceId, resourceId))
        .orderBy(desc(threads.updatedAt))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db.select({ total: count() }).from(threads).where(eq(threads.resourceId, resourceId)),
    ]);

    return { rows, total };
  }

  /** Create a new thread. */
  async create(values: {
    externalId: string;
    resourceId: string;
    title: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const [thread] = await this.db.insert(threads).values(values).returning();
    return thread;
  }

  /** Update a thread by externalId, scoped to a resourceId. */
  async update(externalId: string, resourceId: string, updates: Record<string, unknown>) {
    const [updated] = await this.db
      .update(threads)
      .set(updates)
      .where(and(eq(threads.externalId, externalId), eq(threads.resourceId, resourceId)))
      .returning();
    return updated ?? null;
  }

  /** Delete a thread by internal ID. */
  async delete(internalId: string) {
    await this.db.delete(threads).where(eq(threads.id, internalId));
  }
}
