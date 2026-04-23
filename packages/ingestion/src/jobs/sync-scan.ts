import type { Db } from '@typhoon/db';
import { documents, syncJobs, syncTargets } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getProvider } from '../providers/index';
import { computeSyncDiff } from '../sync';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error';
import { withTimeout } from '../util/with-timeout';
import type { DeleteFileJobData, ProcessFileJobData, ScanJobData } from './queues';
import { makeJobId } from './queues';

const log = createAppLogger('sync-scan');

const STAGE_TIMEOUTS = {
  listObjects: 60_000,
} as const;

export async function handleScanJob(job: Job<ScanJobData>, db: Db, syncQueue: Queue): Promise<void> {
  const { syncTargetId, force } = job.data;

  const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, syncTargetId));
  if (!target || !target.isActive) {
    log.debug('Skipping inactive or missing sync target', { syncTargetId });
    return;
  }

  log.info('Starting sync scan', { syncTargetId, targetName: target.name, force: !!force });

  const [syncJob] = await db.insert(syncJobs).values({ syncTargetId }).returning();

  // Records the current scan stage on the BullMQ job. Flows through
  // QueueEvents → SSE → admin via the existing pipeline.
  const setStage = (stage: string) => job.updateProgress({ stage, startedAt: Date.now() });

  try {
    const provider = getProvider(target.sourceType);
    const config = target.config as Record<string, unknown>;

    await setStage('listObjects');
    const tList = Date.now();
    const sourceObjects = await withTimeout(
      provider.listObjects(config, target.source ?? undefined),
      STAGE_TIMEOUTS.listObjects,
      'listObjects',
    );
    log.info('Listed source objects', { syncTargetId, count: sourceObjects.length, ms: Date.now() - tList });

    await setStage('diff');
    const existingDocs = await db.select().from(documents).where(eq(documents.syncTargetId, syncTargetId));
    const diff = computeSyncDiff(sourceObjects, existingDocs, { force });

    log.info('Sync diff computed', {
      syncTargetId,
      new: diff.newFiles.length,
      updated: diff.updatedFiles.length,
      deleted: diff.deletedDocumentIds.length,
    });

    await setStage('enqueue');

    const totalChildJobs = diff.newFiles.length + diff.updatedFiles.length + diff.deletedDocumentIds.length;
    const childPriority = job.opts?.priority;
    // When force-syncing, include the syncJob ID in child jobIds so they're
    // unique per sync run. For normal syncs, deterministic IDs provide dedup.
    const dedupSalt = force ? syncJob.id : '';

    // Enqueue new files
    for (const file of diff.newFiles) {
      const [doc] = await db
        .insert(documents)
        .values({
          syncTargetId,
          sourceKey: file.key,
          sourceEtag: file.etag,
          fileSize: file.size,
          status: 'processing',
          lastSyncedAt: new Date(),
        })
        .returning();

      await syncQueue.add(
        'process-file',
        {
          syncTargetId,
          documentId: doc.id,
          sourceKey: file.key,
          sourceEtag: file.etag,
          sourceType: target.sourceType,
          sourceName: target.source ?? undefined,
          isUpdate: false,
          syncJobId: syncJob.id,
        } satisfies ProcessFileJobData,
        { jobId: makeJobId('process', syncTargetId, file.key, file.etag, dedupSalt), priority: childPriority },
      );
    }

    // Enqueue updated files (includes error retries)
    for (const file of diff.updatedFiles) {
      const [doc] = await db
        .update(documents)
        .set({
          sourceEtag: file.etag,
          status: 'processing',
          errorMessage: null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.sourceKey, file.key))
        .returning();

      if (doc) {
        await syncQueue.add(
          'process-file',
          {
            syncTargetId,
            documentId: doc.id,
            sourceKey: file.key,
            sourceEtag: file.etag,
            sourceType: target.sourceType,
            sourceName: target.source ?? undefined,
            isUpdate: true,
            syncJobId: syncJob.id,
          } satisfies ProcessFileJobData,
          { jobId: makeJobId('process', syncTargetId, file.key, file.etag, dedupSalt), priority: childPriority },
        );
      }
    }

    // Enqueue deletions
    for (const docId of diff.deletedDocumentIds) {
      await syncQueue.add('delete-file', { documentId: docId, syncJobId: syncJob.id } satisfies DeleteFileJobData, {
        jobId: makeJobId('delete', docId, dedupSalt),
        priority: childPriority,
      });
    }

    // Record scan stats. If there are no child jobs, mark completed
    // immediately (no-op sync). Otherwise, leave as 'running' — child jobs
    // will call incrementSyncJobCompletion() and the last one marks it done.
    await db
      .update(syncJobs)
      .set({
        ...(totalChildJobs === 0 ? { status: 'completed' as const, completedAt: new Date() } : {}),
        childJobsTotal: totalChildJobs,
        filesScanned: totalChildJobs,
        filesNew: diff.newFiles.length,
        filesUpdated: diff.updatedFiles.length,
        filesDeleted: diff.deletedDocumentIds.length,
      })
      .where(eq(syncJobs.id, syncJob.id));
  } catch (error) {
    log.error('Scan job failed', { syncTargetId, error: error instanceof Error ? error.message : String(error) });
    await db
      .update(syncJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJob.id));

    // Skip retries for permanent failures (provider not registered, bucket
    // missing, credentials wrong). Recoverable failures fall through to
    // BullMQ's retry budget.
    if (isUnrecoverable(error)) {
      throw asUnrecoverable(error, 'sync-scan');
    }
    throw error;
  }
}
