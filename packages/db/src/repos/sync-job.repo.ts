import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../client';
import { syncJobs } from '../schema/sync-job';

/** Data-access layer for the sync_jobs table. */
export class SyncJobRepo {
  constructor(private db: Db) {}

  /** List all sync jobs for a given target, newest first. */
  async listByTargetId(syncTargetId: string) {
    return this.db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.syncTargetId, syncTargetId))
      .orderBy(desc(syncJobs.startedAt));
  }

  /** Find the most recent sync job for a target. */
  async findLatest(syncTargetId: string) {
    const [row] = await this.db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.syncTargetId, syncTargetId))
      .orderBy(desc(syncJobs.startedAt))
      .limit(1);
    return row ?? null;
  }

  /** Find all running sync jobs for a target (sorted newest first). */
  async findRunning(syncTargetId: string) {
    return this.db
      .select()
      .from(syncJobs)
      .where(and(eq(syncJobs.syncTargetId, syncTargetId), eq(syncJobs.status, 'running')))
      .orderBy(desc(syncJobs.startedAt));
  }

  /** Insert a new sync job and return the created row. */
  async create(syncTargetId: string) {
    const [row] = await this.db.insert(syncJobs).values({ syncTargetId }).returning();
    return row;
  }

  /** Find the status of a sync job by ID (returns only the status column). */
  async findStatusById(id: string) {
    const [row] = await this.db.select({ status: syncJobs.status }).from(syncJobs).where(eq(syncJobs.id, id));
    return row?.status ?? null;
  }

  /** Update scan statistics for a sync job. */
  async updateStats(
    id: string,
    stats: {
      childJobsTotal: number;
      filesScanned: number;
      filesNew: number;
      filesUpdated: number;
      filesDeleted: number;
      status?: 'running' | 'completed' | 'failed' | 'cancelled';
      completedAt?: Date;
    },
  ) {
    const { status, completedAt, ...rest } = stats;
    await this.db
      .update(syncJobs)
      .set({
        ...rest,
        ...(status ? { status } : {}),
        ...(completedAt ? { completedAt } : {}),
      })
      .where(eq(syncJobs.id, id));
  }

  /** Mark a sync job as failed with an error message. */
  async markFailed(id: string, errorMessage: string) {
    await this.db
      .update(syncJobs)
      .set({ status: 'failed', errorMessage, completedAt: new Date() })
      .where(eq(syncJobs.id, id));
  }

  /**
   * Atomically increment the completion counter for a sync job.
   * Returns the updated totals so the caller can check for completion.
   */
  async incrementCompletion(id: string, failed: boolean) {
    const [row] = await this.db
      .update(syncJobs)
      .set({
        childJobsCompleted: sql`${syncJobs.childJobsCompleted} + 1`,
        filesErrored: failed ? sql`${syncJobs.filesErrored} + 1` : syncJobs.filesErrored,
      })
      .where(eq(syncJobs.id, id))
      .returning({
        childJobsTotal: syncJobs.childJobsTotal,
        childJobsCompleted: syncJobs.childJobsCompleted,
        status: syncJobs.status,
      });
    return row ?? null;
  }

  /** Mark a sync job as completed. */
  async markCompleted(id: string) {
    await this.db.update(syncJobs).set({ status: 'completed', completedAt: new Date() }).where(eq(syncJobs.id, id));
  }

  /** Mark a sync job as cancelled. Returns the cancelled row ID or null if not found. */
  async markCancelled(id: string) {
    const [row] = await this.db
      .update(syncJobs)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(eq(syncJobs.id, id))
      .returning({ id: syncJobs.id });
    return row ?? null;
  }
}
