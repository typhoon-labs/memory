import type { SyncJobRepo } from '@typhoon/db/repos';
import { createAppLogger } from '@typhoon/logger';
import type { Queue } from 'bullmq';

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
export async function cancelSyncJob(
  syncJobRepo: SyncJobRepo,
  syncQueue: Queue,
  syncJobId: string,
): Promise<{ removed: number }> {
  // Mark cancelled in DB — active handlers check this at stage boundaries
  const updated = await syncJobRepo.markCancelled(syncJobId);

  if (!updated) {
    log.warn('Sync job not found for cancellation', { syncJobId });
    return { removed: 0 };
  }

  // Remove waiting/delayed child jobs from the queue
  let removed = 0;
  for (const state of ['waiting', 'delayed'] as const) {
    // oxlint-disable-next-line no-await-in-loop -- sequential: only 2 states, getJobs is state-dependent
    const jobs = await syncQueue.getJobs([state]);
    for (const job of jobs) {
      const jobSyncId = (job.data as { syncJobId?: string })?.syncJobId;
      if (jobSyncId === syncJobId) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- sequential: job removal may race with state changes
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
