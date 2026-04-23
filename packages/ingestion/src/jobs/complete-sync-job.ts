import type { Db } from '@typhoon/db';
import { syncJobs } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import { eq, sql } from 'drizzle-orm';

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
  db: Db,
  syncJobId: string | undefined,
  failed: boolean,
): Promise<void> {
  if (!syncJobId) return;

  const [updated] = await db
    .update(syncJobs)
    .set({
      childJobsCompleted: sql`${syncJobs.childJobsCompleted} + 1`,
      filesErrored: failed ? sql`${syncJobs.filesErrored} + 1` : syncJobs.filesErrored,
    })
    .where(eq(syncJobs.id, syncJobId))
    .returning({
      childJobsTotal: syncJobs.childJobsTotal,
      childJobsCompleted: syncJobs.childJobsCompleted,
      status: syncJobs.status,
    });

  if (!updated) {
    log.warn('Sync job not found for completion increment', { syncJobId });
    return;
  }

  if (updated.childJobsCompleted >= updated.childJobsTotal && updated.status === 'running') {
    await db.update(syncJobs).set({ status: 'completed', completedAt: new Date() }).where(eq(syncJobs.id, syncJobId));

    log.info('Sync job completed', {
      syncJobId,
      total: updated.childJobsTotal,
      completed: updated.childJobsCompleted,
    });
  }
}
