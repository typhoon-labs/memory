import type { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import type { DeleteFileJobData } from '@typhoon/queue';
import type { Job } from 'bullmq';

import { deleteDocumentVectors } from '../pipeline';
import { getProvider } from '../providers/index';
import type { IngestionRepos } from '../repos';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error';
import { withTimeout } from '../util/with-timeout';
import { isSyncJobCancelled } from './check-cancelled';
import { incrementSyncJobCompletion } from './complete-sync-job';

const log = createAppLogger('delete-file');

const STAGE_TIMEOUTS = {
  vectorDelete: 30_000,
  dbUpdate: 15_000,
  sourceDelete: 30_000,
} as const;

export async function handleDeleteFileJob(
  job: Job<DeleteFileJobData>,
  repos: IngestionRepos,
  vectorStore: PgVector,
): Promise<void> {
  const { documentId, sourceKey, sourceType, syncTargetId } = job.data;
  const tStart = Date.now();

  log.info('Deleting document vectors', { documentId });

  // Records the current delete stage on the BullMQ job. Flows through
  // QueueEvents → SSE → admin via the existing pipeline.
  const setStage = (stage: string) => job.updateProgress({ stage, startedAt: Date.now() });

  try {
    if (await isSyncJobCancelled(repos.syncJobRepo, job.data.syncJobId)) {
      log.info('Delete job cancelled', { documentId });
      return;
    }

    await setStage('vectorDelete');
    await withTimeout(deleteDocumentVectors(vectorStore, documentId), STAGE_TIMEOUTS.vectorDelete, 'vectorDelete');

    await setStage('dbUpdate');
    await withTimeout(repos.documentRepo.markDeleted(documentId), STAGE_TIMEOUTS.dbUpdate, 'dbUpdate');

    // If source info is provided, also delete the object from the source.
    // This is best-effort: failure here is logged but doesn't fail the job,
    // since the document is already marked deleted in the DB.
    if (sourceKey && sourceType && syncTargetId) {
      try {
        const target = await repos.syncTargetRepo.findById(syncTargetId);
        if (target) {
          const provider = getProvider(sourceType);
          if (provider.deleteObject) {
            const config = target.config as Record<string, unknown>;
            await setStage('sourceDelete');
            await withTimeout(
              provider.deleteObject(config, sourceKey, target.source ?? undefined),
              STAGE_TIMEOUTS.sourceDelete,
              'sourceDelete',
            );
            log.info('Source object deleted', { sourceKey });
          }
        }
      } catch (error) {
        log.warn('Failed to delete source object', {
          sourceKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, false);

    log.info('Document marked deleted', { documentId, totalMs: Date.now() - tStart });
  } catch (error) {
    log.error('Delete job failed', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
      totalMs: Date.now() - tStart,
    });
    if (isUnrecoverable(error)) {
      throw asUnrecoverable(error, 'delete-file');
    }
    throw error;
  }
}
