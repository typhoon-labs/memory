import type { Db } from '@typhoon/db';
import { documents, syncTargets } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { PgVector } from '@typhoon/pg';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { deleteDocumentVectors, processFile } from '../pipeline.js';
import { getProvider } from '../providers/index.js';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error.js';
import { withTimeout } from '../util/with-timeout.js';
import type { ProcessFileJobData } from './queues.js';

const log = createAppLogger('process-file');

const STAGE_TIMEOUTS = {
  download: 60_000,
  vectorDelete: 30_000,
} as const;

export async function handleProcessFileJob(job: Job<ProcessFileJobData>, db: Db, vectorStore: PgVector): Promise<void> {
  const { documentId, sourceKey, sourceType, sourceName, isUpdate, syncTargetId } = job.data;
  const tStart = Date.now();

  log.info('Processing file', { documentId, sourceKey, sourceType, isUpdate });

  // Look up sync target config for the provider
  const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, syncTargetId));
  if (!target) {
    // Permanent failure: the sync target was deleted between scan and
    // process-file. Retrying won't bring it back.
    throw new UnrecoverableError(`Sync target not found: ${syncTargetId}`);
  }

  const provider = getProvider(sourceType);
  const config = target.config as Record<string, unknown>;

  // Records the current pipeline stage on the BullMQ job. The progress
  // payload flows through QueueEvents → SSE → admin so the job detail sheet
  // shows live "current stage: X" with no polling.
  const setStage = (stage: string) => job.updateProgress({ stage, startedAt: Date.now() });

  try {
    await setStage('download');
    const tDownload = Date.now();
    const content = await withTimeout(
      provider.download(config, sourceKey, sourceName),
      STAGE_TIMEOUTS.download,
      'download',
    );
    log.info('Downloaded file', { sourceKey, bytes: content.length, ms: Date.now() - tDownload });

    if (isUpdate) {
      await setStage('vectorDelete');
      const tDel = Date.now();
      await withTimeout(deleteDocumentVectors(vectorStore, documentId), STAGE_TIMEOUTS.vectorDelete, 'vectorDelete');
      log.info('Deleted old vectors', { documentId, ms: Date.now() - tDel });
    }

    const result = await processFile(
      {
        content,
        filename: sourceKey,
        documentId,
        syncTargetId,
        sourceKey,
        onStage: setStage,
      },
      vectorStore,
    );

    await db
      .update(documents)
      .set({
        status: 'ready',
        title: result.title,
        description: result.description,
        chunkCount: result.chunkCount,
        mimeType: guessMimeType(sourceKey),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    log.info('File processed', {
      documentId,
      sourceKey,
      chunkCount: result.chunkCount,
      totalMs: Date.now() - tStart,
    });
  } catch (error) {
    log.error('File processing failed', {
      documentId,
      sourceKey,
      error: error instanceof Error ? error.message : String(error),
      totalMs: Date.now() - tStart,
    });
    await db
      .update(documents)
      .set({
        status: 'parse_error',
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    // Skip BullMQ retries for permanent failures (404 from source, missing
    // parser, malformed config, etc.). Recoverable errors fall through and
    // retry with the queue's exponential backoff.
    if (isUnrecoverable(error)) {
      throw asUnrecoverable(error, 'process-file');
    }
    throw error;
  }
}

function guessMimeType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}
