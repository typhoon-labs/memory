import type { Db } from '@typhoon/db';
import { syncJobs } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';

const log = createAppLogger('cancel-sync');

/**
 * Cancel a running sync job.
 *
 * 1. Marks the sync job record as `'cancelled'` in the DB.
 * 2. Removes any waiting/delayed child jobs from the queue.
 * 3. Active jobs self-cancel at the next stage boundary via
 *    {@link isSyncJobCancelled}.
 *
 * @returns Number of waiting/delayed jobs that were removed from the queue.
 */
export async function cancelSyncJob(db: Db, syncQueue: Queue, syncJobId: string): Promise<{ removed: number }> {
  // Mark cancelled in DB — active handlers check this at stage boundaries
  const [updated] = await db
    .update(syncJobs)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(eq(syncJobs.id, syncJobId))
    .returning({ id: syncJobs.id });

  if (!updated) {
    log.warn('Sync job not found for cancellation', { syncJobId });
    return { removed: 0 };
  }

  // Remove waiting/delayed child jobs from the queue
  let removed = 0;
  for (const state of ['waiting', 'delayed'] as const) {
    const jobs = await syncQueue.getJobs([state]);
    for (const job of jobs) {
      const jobSyncId = (job.data as { syncJobId?: string })?.syncJobId;
      if (jobSyncId === syncJobId) {
        try {
          await job.remove();
          removed++;
        } catch {
          // Job may have transitioned to active between listing and removal
        }
      }
    }
  }

  log.info('Sync job cancelled', { syncJobId, removedFromQueue: removed });
  return { removed };
}
