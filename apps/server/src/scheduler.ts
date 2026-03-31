import { syncTargets } from '@typhoon/db';
import type { ScanJobData } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { getSyncQueue } from './queue.js';

const log = createAppLogger('scheduler');

let jobs: Cron[] = [];

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
        await syncQueue.add('scan', { syncTargetId: target.id } satisfies ScanJobData);
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

  log.info('Scheduler refreshed', { scheduled: jobs.length });
}

/** Stop all scheduled cron jobs. */
export function stopScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
  log.info('Scheduler stopped');
}
