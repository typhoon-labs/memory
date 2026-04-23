import type { Db } from '@typhoon/db';
import { syncJobs } from '@typhoon/db';
import { eq } from 'drizzle-orm';

/**
 * Check whether the parent sync job has been cancelled. Designed to be called
 * at stage boundaries inside job handlers so active jobs can bail out early
 * when a user cancels a sync.
 *
 * Returns `false` when `syncJobId` is undefined (e.g. direct uploads that
 * aren't part of a sync workflow).
 */
export async function isSyncJobCancelled(db: Db, syncJobId: string | undefined): Promise<boolean> {
  if (!syncJobId) return false;

  const [job] = await db.select({ status: syncJobs.status }).from(syncJobs).where(eq(syncJobs.id, syncJobId));

  return job?.status === 'cancelled';
}
