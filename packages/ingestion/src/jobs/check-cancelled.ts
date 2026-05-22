import type { SyncJobRepo } from '@typhoon/db/repos';

/**
 * Check whether the parent sync job has been cancelled. Designed to be called
 * at stage boundaries inside job handlers so active jobs can bail out early
 * when a user cancels a sync.
 *
 * Returns `false` when `syncJobId` is undefined (e.g. direct uploads that
 * aren't part of a sync workflow).
 */
export async function isSyncJobCancelled(syncJobRepo: SyncJobRepo, syncJobId: string | undefined): Promise<boolean> {
  if (!syncJobId) return false;

  const status = await syncJobRepo.findStatusById(syncJobId);

  return status === 'cancelled';
}
