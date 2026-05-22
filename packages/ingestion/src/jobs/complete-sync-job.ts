import type { SyncJobRepo } from '@typhoon/db/repos';
import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('complete-sync-job');

/**
 * Atomically increment the completion counter for a sync job. When all child
 * jobs have reported back (success or failure), the sync job is marked as
 * completed.
 *
 * Safe to call concurrently from multiple workers — the counter update is a
 * single atomic SQL statement and the completion check uses a `status = 'running'`
 * guard to prevent double-completion races.
 */
export async function incrementSyncJobCompletion(
  syncJobRepo: SyncJobRepo,
  syncJobId: string | undefined,
  failed: boolean,
): Promise<void> {
  if (!syncJobId) return;

  const updated = await syncJobRepo.incrementCompletion(syncJobId, failed);

  if (!updated) {
    log.warn('Sync job not found for completion increment', { syncJobId });
    return;
  }

  if (updated.childJobsCompleted >= updated.childJobsTotal && updated.status === 'running') {
    await syncJobRepo.markCompleted(syncJobId);

    log.info('Sync job completed', {
      syncJobId,
      total: updated.childJobsTotal,
      completed: updated.childJobsCompleted,
    });
  }
}
