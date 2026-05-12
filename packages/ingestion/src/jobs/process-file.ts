import type { Db } from '@typhoon/db';
import { documents, metadataFieldGroups, metadataTemplates, syncTargets } from '@typhoon/db';
import type { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import { applySchemaDefaults, resolveTemplateSchema } from '@typhoon/types';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import { deleteDocumentVectors, extractMetadataFromContent, processFile } from '../pipeline';
import { getProvider } from '../providers/index';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error';
import { withTimeout } from '../util/with-timeout';
import { isSyncJobCancelled } from './check-cancelled';
import { incrementSyncJobCompletion } from './complete-sync-job';
import type { ProcessFileJobData } from './queues';

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

    // Resolve custom metadata from template defaults + existing document metadata
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    let customMetadata: Record<string, unknown> = doc?.customMetadata ?? {};

    if (target.metadataTemplateId) {
      const [tmpl] = await db
        .select()
        .from(metadataTemplates)
        .where(eq(metadataTemplates.id, target.metadataTemplateId));

      if (tmpl) {
        const groups =
          tmpl.fieldGroupIds.length > 0
            ? await db.select().from(metadataFieldGroups).where(inArray(metadataFieldGroups.id, tmpl.fieldGroupIds))
            : [];

        // biome-ignore lint/suspicious/noExplicitAny: JSONB types
        const schema = resolveTemplateSchema(tmpl as any, groups as any);
        const defaults = applySchemaDefaults(schema);
        // Merge: defaults < existing < (LLM-extracted later)
        customMetadata = { ...defaults, ...customMetadata };

        // LLM extraction (optional, runs after we have the text content)
        if (target.autoExtractMetadata && Object.keys(schema).length > 0) {
          try {
            const { createExtractionModel } = await import('@typhoon/ai');
            const extracted = await extractMetadataFromContent(
              Buffer.from(content).toString('utf-8').slice(0, 8000),
              schema,
              createExtractionModel(),
            );
            customMetadata = { ...customMetadata, ...extracted };
          } catch (err) {
            log.warn('LLM metadata extraction failed, continuing with defaults', {
              documentId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Save computed custom metadata to document
        await db.update(documents).set({ customMetadata, updatedAt: new Date() }).where(eq(documents.id, documentId));
      }
    }

    const result = await processFile(
      {
        content,
        filename: sourceKey,
        documentId,
        syncTargetId,
        sourceKey,
        onStage: setStage,
        isCancelled: () => isSyncJobCancelled(db, job.data.syncJobId),
        customMetadata,
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
        customMetadata,
        mimeType: guessMimeType(sourceKey),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    await incrementSyncJobCompletion(db, job.data.syncJobId, false);

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

export function guessMimeType(key: string): string {
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
