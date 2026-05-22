import type { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import type { ProcessFileJobData } from '@typhoon/queue';
import { applySchemaDefaults } from '@typhoon/types';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type { Sql } from 'postgres';

import { buildSearchMetaFields, deleteDocumentVectors, processFile, refreshDocumentSearchMeta } from '../pipeline';
import { getProvider } from '../providers/index';
import type { IngestionRepos } from '../repos';
import { asUnrecoverable, isUnrecoverable } from '../util/classify-error';
import { withTimeout } from '../util/with-timeout';
import { isSyncJobCancelled } from './check-cancelled';
import { incrementSyncJobCompletion } from './complete-sync-job';

const log = createAppLogger('process-file');

const STAGE_TIMEOUTS = {
  download: 60_000,
  vectorDelete: 30_000,
} as const;

export async function handleProcessFileJob(
  job: Job<ProcessFileJobData>,
  repos: IngestionRepos,
  vectorStore: PgVector,
  sql?: Sql,
): Promise<{ warnings: string[] } | undefined> {
  const { documentId, sourceKey, sourceType, sourceName, isUpdate, syncTargetId, metaRefreshOnly } = job.data;
  const tStart = Date.now();
  const warnings: string[] = [];

  // Lightweight path: only refresh _searchMeta_* fields (no download/parse/embed)
  if (metaRefreshOnly) {
    return handleMetaRefreshOnly(job, repos, sql);
  }

  log.info('Processing file', { documentId, sourceKey, sourceType, isUpdate });

  // Look up sync target config for the provider
  const target = await repos.syncTargetRepo.findById(syncTargetId);
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
  let currentStage = 'init';
  const setStage = (stage: string) => {
    currentStage = stage;
    job.updateProgress({ stage, startedAt: Date.now() });
  };

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

    // Resolve custom metadata schema + defaults from template
    const doc = await repos.documentRepo.findById(documentId);
    let customMetadata: Record<string, unknown> = doc?.customMetadata ?? {};
    let metadataSchema:
      | Record<
          string,
          { type: 'string' | 'number' | 'boolean' | 'string[]'; allowedValues?: unknown[]; description?: string }
        >
      | undefined;
    let fieldSchema:
      | Record<string, { searchable?: boolean; searchPriority?: 'critical' | 'high' | 'moderate' | 'standard' }>
      | undefined;

    log.debug('Document metadata baseline', {
      documentId,
      existingFieldCount: Object.keys(customMetadata).length,
    });

    if (target.metadataTemplateId) {
      const schema = await repos.metadataRepo.resolveEffectiveSchema(target.metadataTemplateId);

      log.debug('Metadata template lookup', {
        documentId,
        templateId: target.metadataTemplateId,
        found: !!schema,
      });

      if (schema) {
        const defaults = applySchemaDefaults(schema);

        log.debug('Resolved metadata schema', {
          documentId,
          fieldCount: Object.keys(schema).length,
          fieldNames: Object.keys(schema),
        });
        log.debug('Applied schema defaults', {
          documentId,
          defaultFields: Object.keys(defaults),
        });

        // Merge defaults with existing metadata
        customMetadata = { ...defaults, ...customMetadata };

        // Always pass field schema for search meta field generation (weighted tsvector)
        if (Object.keys(schema).length > 0) {
          fieldSchema = schema;
        }

        // Pass schema to processFile for combined LLM extraction (if enabled)
        if (target.autoExtractMetadata && Object.keys(schema).length > 0) {
          metadataSchema = schema;
        }
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
        isCancelled: () => isSyncJobCancelled(repos.syncJobRepo, job.data.syncJobId),
        customMetadata,
        metadataSchema,
        fieldSchema,
      },
      vectorStore,
    );

    await repos.documentRepo.markReady(documentId, {
      title: result.title ?? undefined,
      description: result.description ?? undefined,
      chunkCount: result.chunkCount,
      customMetadata: result.customMetadata,
      mimeType: guessMimeType(sourceKey),
    });

    // Clear dirty flag after full reprocess (produces fresh _searchMeta_* fields)
    await repos.documentRepo.clearSearchMetaDirty(documentId);

    await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, false);

    log.info('File processed', {
      documentId,
      sourceKey,
      chunkCount: result.chunkCount,
      totalMs: Date.now() - tStart,
    });

    return warnings.length > 0 ? { warnings } : undefined;
  } catch (error) {
    log.error('File processing failed', {
      documentId,
      sourceKey,
      error: error instanceof Error ? error.message : String(error),
      totalMs: Date.now() - tStart,
    });
    await repos.documentRepo.markError(
      documentId,
      `[${currentStage}] ${error instanceof Error ? error.message : String(error)}`,
    );

    // Skip BullMQ retries for permanent failures (404 from source, missing
    // parser, malformed config, etc.). Recoverable errors fall through and
    // retry with the queue's exponential backoff.
    if (isUnrecoverable(error)) {
      throw asUnrecoverable(error, 'process-file');
    }
    throw error;
  }
}

async function handleMetaRefreshOnly(
  job: Job<ProcessFileJobData>,
  repos: IngestionRepos,
  sqlInstance?: Sql,
): Promise<{ warnings: string[] } | undefined> {
  const { documentId, sourceKey, syncTargetId } = job.data;
  const tStart = Date.now();

  log.info('Meta-refresh only', { documentId, sourceKey });

  try {
    const target = await repos.syncTargetRepo.findById(syncTargetId);
    if (!target?.metadataTemplateId) {
      await repos.documentRepo.clearSearchMetaDirty(documentId);
      await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, false);
      return undefined;
    }

    const schema = await repos.metadataRepo.resolveEffectiveSchema(target.metadataTemplateId);
    if (!schema) {
      await repos.documentRepo.clearSearchMetaDirty(documentId);
      await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, false);
      return undefined;
    }

    const doc = await repos.documentRepo.findById(documentId);
    if (!doc) {
      await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, false);
      return undefined;
    }

    const searchMetaFields = buildSearchMetaFields(doc.customMetadata ?? {}, schema);

    if (sqlInstance) {
      await refreshDocumentSearchMeta(sqlInstance, documentId, searchMetaFields);
    }

    await repos.documentRepo.clearSearchMetaDirty(documentId);
    await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, false);

    log.info('Meta-refresh completed', { documentId, sourceKey, totalMs: Date.now() - tStart });
    return undefined;
  } catch (error) {
    log.error('Meta-refresh failed', {
      documentId,
      sourceKey,
      error: error instanceof Error ? error.message : String(error),
    });
    await incrementSyncJobCompletion(repos.syncJobRepo, job.data.syncJobId, true);
    if (isUnrecoverable(error)) {
      throw asUnrecoverable(error, 'meta-refresh');
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
