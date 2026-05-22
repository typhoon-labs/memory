import { createAppLogger } from '@typhoon/logger';
import { childPriorityFor } from '@typhoon/queue';
import type { DeleteFileJobData, ProcessFileJobData, ScanJobData } from '@typhoon/queue';
import { makeJobId } from '@typhoon/queue';
import type { Job, Queue } from 'bullmq';

import { getProvider } from '../providers/index';
import type { IngestionRepos } from '../repos';
import { computeSyncDiff } from '../sync';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error';
import { withTimeout } from '../util/with-timeout';

const log = createAppLogger('sync-scan');

const STAGE_TIMEOUTS = {
  listObjects: 60_000,
} as const;

export async function handleScanJob(job: Job<ScanJobData>, repos: IngestionRepos, syncQueue: Queue): Promise<void> {
  const { syncTargetId, force } = job.data;

  const target = await repos.syncTargetRepo.findById(syncTargetId);
  if (!target?.isActive) {
    log.debug('Skipping inactive or missing sync target', { syncTargetId });
    return;
  }

  log.info('Starting sync scan', { syncTargetId, targetName: target.name, force: !!force });

  const syncJob = await repos.syncJobRepo.create(syncTargetId);

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
    const existingDocs = await repos.documentRepo.listBySyncTarget(syncTargetId);
    const diff = computeSyncDiff(sourceObjects, existingDocs, { force });

    log.info('Sync diff computed', {
      syncTargetId,
      new: diff.newFiles.length,
      updated: diff.updatedFiles.length,
      deleted: diff.deletedDocumentIds.length,
      metaRefresh: diff.metaRefreshFiles.length,
    });

    await setStage('enqueue');

    let actualEnqueued = 0;
    const childPriority = childPriorityFor(job.opts?.priority);
    // Always include the syncJob ID so each sync run creates unique job IDs.
    // The per-source guard in SyncTargetService.sync() prevents concurrent
    // syncs on the same target, replacing the old cross-sync dedup strategy.
    const dedupSalt = syncJob.id;

    // Enqueue new files
    for (const file of diff.newFiles) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: create doc then enqueue per file
      const doc = await repos.documentRepo.create({
        syncTargetId,
        sourceKey: file.key,
        sourceEtag: file.etag,
        fileSize: file.size,
        status: 'processing',
        lastSyncedAt: new Date(),
      });

      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on doc.id above
      const added = await syncQueue.add(
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
      if (added) actualEnqueued++;
    }

    // Enqueue updated files (includes error retries)
    for (const file of diff.updatedFiles) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: update doc then enqueue per file
      const doc = await repos.documentRepo.updateForSync(file.key, {
        sourceEtag: file.etag,
        status: 'processing',
        errorMessage: null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      });

      if (doc) {
        // oxlint-disable-next-line no-await-in-loop -- sequential: depends on doc.id above
        const added = await syncQueue.add(
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
        if (added) actualEnqueued++;
      }
    }

    // Enqueue meta-refresh-only jobs (search weights changed, no content change)
    for (const doc of diff.metaRefreshFiles) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: enqueue per document
      const added = await syncQueue.add(
        'process-file',
        {
          syncTargetId,
          documentId: doc.id,
          sourceKey: doc.sourceKey,
          sourceEtag: doc.sourceEtag ?? '',
          sourceType: target.sourceType,
          sourceName: target.source ?? undefined,
          isUpdate: false,
          metaRefreshOnly: true,
          syncJobId: syncJob.id,
        } satisfies ProcessFileJobData,
        { jobId: makeJobId('meta-refresh', syncTargetId, doc.sourceKey, dedupSalt), priority: childPriority },
      );
      if (added) actualEnqueued++;
    }

    // Enqueue deletions
    for (const docId of diff.deletedDocumentIds) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: queue deletion jobs one at a time
      const added = await syncQueue.add(
        'delete-file',
        { documentId: docId, syncJobId: syncJob.id } satisfies DeleteFileJobData,
        { jobId: makeJobId('delete', docId, dedupSalt), priority: childPriority },
      );
      if (added) actualEnqueued++;
    }

    // Record scan stats. If no child jobs were actually enqueued (all deduped
    // or nothing to do), mark completed immediately. Otherwise, leave as
    // 'running' — child jobs call incrementSyncJobCompletion() and the last
    // one marks it done.
    await repos.syncJobRepo.updateStats(syncJob.id, {
      ...(actualEnqueued === 0 ? { status: 'completed' as const, completedAt: new Date() } : {}),
      childJobsTotal: actualEnqueued,
      filesScanned: actualEnqueued,
      filesNew: diff.newFiles.length,
      filesUpdated: diff.updatedFiles.length,
      filesDeleted: diff.deletedDocumentIds.length,
    });
  } catch (error) {
    log.error('Scan job failed', { syncTargetId, error: error instanceof Error ? error.message : String(error) });
    await repos.syncJobRepo.markFailed(syncJob.id, error instanceof Error ? error.message : String(error));

    // Skip retries for permanent failures (provider not registered, bucket
    // missing, credentials wrong). Recoverable failures fall through to
    // BullMQ's retry budget.
    if (isUnrecoverable(error)) {
      throw asUnrecoverable(error, 'sync-scan');
    }
    throw error;
  }
}
