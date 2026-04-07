import type { Db } from '@typhoon/db';
import { documents, syncTargets } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { PgVector } from '@typhoon/pg';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { deleteDocumentVectors } from '../pipeline.js';
import { getProvider } from '../providers/index.js';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error.js';
import { withTimeout } from '../util/with-timeout.js';
import type { DeleteFileJobData } from './queues.js';

const log = createAppLogger('delete-file');

const STAGE_TIMEOUTS = {
  vectorDelete: 30_000,
  dbUpdate: 15_000,
  sourceDelete: 30_000,
} as const;

export async function handleDeleteFileJob(job: Job<DeleteFileJobData>, db: Db, vectorStore: PgVector): Promise<void> {
  const { documentId, sourceKey, sourceType, syncTargetId } = job.data;
  const tStart = Date.now();

  log.info('Deleting document vectors', { documentId });

  // Records the current delete stage on the BullMQ job. Flows through
  // QueueEvents → SSE → admin via the existing pipeline.
  const setStage = (stage: string) => job.updateProgress({ stage, startedAt: Date.now() });

  try {
    await setStage('vectorDelete');
    await withTimeout(deleteDocumentVectors(vectorStore, documentId), STAGE_TIMEOUTS.vectorDelete, 'vectorDelete');

    await setStage('dbUpdate');
    await withTimeout(
      db.update(documents).set({ status: 'deleted', updatedAt: new Date() }).where(eq(documents.id, documentId)),
      STAGE_TIMEOUTS.dbUpdate,
      'dbUpdate',
    );

    // If source info is provided, also delete the object from the source.
    // This is best-effort: failure here is logged but doesn't fail the job,
    // since the document is already marked deleted in the DB.
    if (sourceKey && sourceType && syncTargetId) {
      try {
        const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, syncTargetId));
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
