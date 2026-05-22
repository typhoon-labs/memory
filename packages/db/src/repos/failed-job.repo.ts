import { desc, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { failedJobs } from '../schema/failed-job';

/** Data-access layer for the persistent failed-job archive table. */
export class FailedJobRepo {
  constructor(private db: Db) {}

  /** List archived failed jobs with optional queue filter, ordered by creation date. */
  async list(filter: { limit: number; offset: number; queue?: string }) {
    const { limit, offset, queue } = filter;

    if (queue) {
      return this.db
        .select()
        .from(failedJobs)
        .where(eq(failedJobs.queue, queue))
        .orderBy(desc(failedJobs.createdAt))
        .limit(limit)
        .offset(offset);
    }

    return this.db.select().from(failedJobs).orderBy(desc(failedJobs.createdAt)).limit(limit).offset(offset);
  }

  /** Find a single archived failed job by ID. */
  async findById(id: string) {
    const [row] = await this.db.select().from(failedJobs).where(eq(failedJobs.id, id));
    return row ?? null;
  }

  /** Delete an archived failed job by ID. */
  async delete(id: string) {
    await this.db.delete(failedJobs).where(eq(failedJobs.id, id));
  }

  /** Insert a new failed-job archive record. */
  async create(data: {
    queue: string;
    jobName: string;
    jobId: string;
    data: unknown;
    failedReason: string;
    stacktrace: string | null;
    attemptsMade?: number;
    syncTargetId?: string | null;
    documentId?: string | null;
  }) {
    await this.db.insert(failedJobs).values(data);
  }
}
