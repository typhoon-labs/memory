import { failedJobs, syncTargets } from '@typhoon/db';
import { JOB_PRIORITY, type ScanJobData } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { Cron } from 'croner';
import { eq, lt } from 'drizzle-orm';
import { db } from './db';
import { getSyncQueue } from './queue';

const log = createAppLogger('scheduler');

let jobs: Cron[] = [];
let retentionInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Load all active sync targets and schedule cron jobs.
 * Safe to call multiple times — previous jobs are stopped first.
 */
export async function refreshScheduler(): Promise<void> {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];

  const targets = await db
    .select({ id: syncTargets.id, name: syncTargets.name, cronSchedule: syncTargets.cronSchedule })
    .from(syncTargets)
    .where(eq(syncTargets.isActive, true));

  const syncQueue = getSyncQueue();

  for (const target of targets) {
    try {
      const job = new Cron(target.cronSchedule, async () => {
        log.info('Cron-triggered sync', { id: target.id, name: target.name });
        await syncQueue.add('scan', { syncTargetId: target.id } satisfies ScanJobData, {
          jobId: crypto.randomUUID(),
          priority: JOB_PRIORITY.CRON,
        });
      });
      jobs.push(job);
      log.info('Scheduled sync target', {
        id: target.id,
        name: target.name,
        cron: target.cronSchedule,
        nextRun: job.nextRun()?.toISOString(),
      });
    } catch (err) {
      log.error('Failed to schedule sync target', {
        id: target.id,
        name: target.name,
        cron: target.cronSchedule,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Daily cleanup of archived failed jobs older than 90 days (started once)
  if (!retentionInterval) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const runRetention = async () => {
      try {
        const cutoff = new Date(Date.now() - 90 * DAY_MS);
        const deleted = await db
          .delete(failedJobs)
          .where(lt(failedJobs.createdAt, cutoff))
          .returning({ id: failedJobs.id });
        if (deleted.length > 0) {
          log.info('Cleaned up old failed job records', { deleted: deleted.length });
        }
      } catch (err) {
        log.error('Failed job retention cleanup failed', { error: err instanceof Error ? err.message : String(err) });
      }
    };
    retentionInterval = setInterval(runRetention, DAY_MS);
  }

  log.info('Scheduler refreshed', { scheduled: jobs.length });
}

/** Stop all scheduled cron jobs. */
export function stopScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
  }
  log.info('Scheduler stopped');
}
