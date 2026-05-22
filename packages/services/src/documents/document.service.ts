import type { PgVector } from '@typhoon/db/drivers/pg';
import type { DocumentRepo, MetadataRepo, SyncTargetRepo } from '@typhoon/db/repos';
import {
  buildSearchMetaFields,
  deleteDocumentVectors,
  getParser,
  getProvider,
  needsCustomParser,
  refreshDocumentSearchMeta,
  updateDocumentVectorMetadata,
  updateDocumentVectorSource,
  updateDocumentVectorTitle,
} from '@typhoon/ingestion';
import type { ProcessFileJobData } from '@typhoon/queue';
import { validateCustomMetadata } from '@typhoon/types';
import type { Queue } from 'bullmq';

import type { Result } from '../types';

export interface DocumentServiceDeps {
  documentRepo: DocumentRepo;
  syncTargetRepo: SyncTargetRepo;
  metadataRepo: MetadataRepo;
  vectorStore: PgVector;
  syncQueue: Queue;
  sql: { unsafe: (...args: never[]) => unknown };
}

export class DocumentService {
  constructor(private deps: DocumentServiceDeps) {}

  /** Find a single document by ID. */
  async getById(id: string): Promise<Result<Record<string, unknown>>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };
    return { data: doc };
  }

  /** List documents with optional sync-target filter. */
  async list(syncTargetId?: string): Promise<Result<unknown[]>> {
    const docs = syncTargetId
      ? await this.deps.documentRepo.listBySyncTarget(syncTargetId)
      : await this.deps.documentRepo.listAll();
    return { data: docs };
  }

  /** Get a document together with its vector chunks. */
  async getChunks(id: string): Promise<Result<{ document: Record<string, unknown>; chunks: unknown[] }>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    const chunkRows = await this.deps.vectorStore.getChunksByDocumentId('knowledge_base', id);

    const chunks = chunkRows.map((row) => ({
      text: row.metadata.text ?? '',
      startIndex: row.metadata.startIndex ?? null,
    }));

    return { data: { document: doc, chunks } };
  }

  /**
   * Download a document from its source, parse it, and return plain text.
   * Supports ETag-based 304 Not Modified via `clientEtag`.
   */
  async getParsedContent(
    id: string,
    clientEtag?: string,
  ): Promise<Result<{ notModified: true } | { text: string; contentHash: string | null }>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    if (doc.contentHash && clientEtag === doc.contentHash) {
      return { data: { notModified: true } };
    }

    const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);
    if (!target) return { error: 'Sync target not found' };

    const provider = getProvider(target.sourceType);
    const config = target.config as Record<string, unknown>;
    const content = await provider.download(config, doc.sourceKey, target.source ?? undefined);

    let text: string;
    if (needsCustomParser(doc.sourceKey)) {
      const parser = getParser(doc.sourceKey);
      if (!parser) return { error: 'No parser available' };
      const result = await parser(Buffer.from(content), doc.sourceKey);
      text = result.text;
    } else {
      text = Buffer.from(content).toString('utf-8');
    }

    return { data: { text, contentHash: doc.contentHash } };
  }

  /** Download the raw file content from source. */
  async download(id: string): Promise<Result<{ content: Uint8Array; mimeType: string | null; filename: string }>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);
    if (!target) return { error: 'Sync target not found' };

    const provider = getProvider(target.sourceType);
    const config = target.config as Record<string, unknown>;
    const content = await provider.download(config, doc.sourceKey, target.source ?? undefined);
    const filename = doc.sourceKey.split('/').pop() ?? 'download';

    return { data: { content, mimeType: doc.mimeType, filename } };
  }

  /** Update document metadata (title, description, customMetadata). Validates against template schema. */
  async updateMetadata(
    id: string,
    input: {
      title?: string | null;
      description?: string | null;
      customMetadata?: Record<string, unknown>;
    },
  ): Promise<Result<Record<string, unknown>>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    let normalizedMetadata = input.customMetadata;
    let fieldSchema: Record<string, unknown> | null = null;

    if (input.customMetadata) {
      const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);
      if (target?.metadataTemplateId) {
        const schema = await this.deps.metadataRepo.resolveEffectiveSchema(target.metadataTemplateId);
        if (schema) {
          fieldSchema = schema;
          const merged = { ...doc.customMetadata, ...input.customMetadata };
          const result = validateCustomMetadata(merged, schema);
          if (!result.valid) {
            return { error: 'Metadata validation failed', details: result.errors };
          }
          normalizedMetadata = result.normalized;
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (normalizedMetadata !== undefined) updateData.customMetadata = normalizedMetadata;

    const updated = await this.deps.documentRepo.update(id, updateData);

    // Propagate changes to vector chunk metadata
    if (input.title !== undefined && input.title !== doc.title) {
      await updateDocumentVectorTitle(this.deps.sql, id, input.title ?? '');
    }
    if (normalizedMetadata !== undefined) {
      await updateDocumentVectorMetadata(this.deps.sql, id, normalizedMetadata);

      // Rebuild _searchMeta_* fields so weighted FTS reflects the new values
      if (fieldSchema) {
        const searchMetaFields = buildSearchMetaFields(normalizedMetadata, fieldSchema as never);
        await refreshDocumentSearchMeta(this.deps.sql, id, searchMetaFields);
      }
    }

    return { data: updated };
  }

  /** Bulk update custom metadata across multiple documents with per-document validation. */
  async bulkUpdateMetadata(input: {
    ids: string[];
    customMetadata: Record<string, unknown>;
    merge: boolean;
  }): Promise<Result<{ ok: true; updated: number; errors?: string[] }>> {
    const docs = await this.deps.documentRepo.findByIds(input.ids);
    if (docs.length === 0) return { data: { ok: true, updated: 0 } };

    // Group documents by sync target to resolve schemas efficiently
    const targetIds = [...new Set(docs.map((d) => d.syncTargetId))];
    const targets = await this.deps.syncTargetRepo.findByIds(targetIds);
    const targetMap = new Map(targets.map((t) => [t.id, t]));

    // Resolve effective schemas for all referenced templates
    const templateIds = [...new Set(targets.map((t) => t.metadataTemplateId).filter(Boolean))] as string[];
    const schemaMap = new Map<string, Awaited<ReturnType<MetadataRepo['resolveEffectiveSchema']>>>();
    const schemas = await Promise.all(templateIds.map((tid) => this.deps.metadataRepo.resolveEffectiveSchema(tid)));
    for (let i = 0; i < templateIds.length; i++) {
      schemaMap.set(templateIds[i], schemas[i]);
    }

    let updatedCount = 0;
    const errors: string[] = [];

    for (const doc of docs) {
      const target = targetMap.get(doc.syncTargetId);
      const schema = target?.metadataTemplateId ? schemaMap.get(target.metadataTemplateId) : null;

      let newMetadata: Record<string, unknown>;
      if (schema) {
        const merged = input.merge ? { ...doc.customMetadata, ...input.customMetadata } : input.customMetadata;
        const result = validateCustomMetadata(merged, schema);
        if (!result.valid) {
          errors.push(`Document ${doc.id}: ${result.errors.join(', ')}`);
          continue;
        }
        newMetadata = result.normalized;
      } else {
        // No template — strip all custom metadata
        newMetadata = {};
      }

      // oxlint-disable-next-line no-await-in-loop -- sequential: update doc then vector metadata per doc
      await this.deps.documentRepo.update(doc.id, { customMetadata: newMetadata });
      // oxlint-disable-next-line no-await-in-loop -- sequential: must follow doc update
      await updateDocumentVectorMetadata(this.deps.sql, doc.id, newMetadata);
      updatedCount++;
    }

    return { data: { ok: true, updated: updatedCount, errors: errors.length > 0 ? errors : undefined } };
  }

  /** Retry a failed document by re-queuing it for processing. */
  async retryFailed(id: string): Promise<Result<Record<string, unknown>>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    if (doc.status !== 'error') {
      return { error: 'Document is not in an error state' };
    }

    const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);
    if (!target) return { error: 'Sync target not found' };

    const updated = await this.deps.documentRepo.markProcessing(id);

    await this.deps.syncQueue.add('process-file', {
      syncTargetId: doc.syncTargetId,
      documentId: doc.id,
      sourceKey: doc.sourceKey,
      sourceEtag: doc.sourceEtag ?? '',
      sourceType: target.sourceType,
      sourceName: target.source ?? undefined,
      isUpdate: true,
    } satisfies ProcessFileJobData);

    return { data: updated };
  }

  /** Force re-sync a document regardless of status (except deleted/processing/pending). */
  async resync(id: string): Promise<Result<Record<string, unknown>>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    if (doc.status === 'processing' || doc.status === 'pending') {
      return { error: 'Document is already being processed' };
    }

    const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);
    if (!target) return { error: 'Sync target not found' };

    const updated = await this.deps.documentRepo.markProcessing(id);

    await this.deps.syncQueue.add('process-file', {
      syncTargetId: doc.syncTargetId,
      documentId: doc.id,
      sourceKey: doc.sourceKey,
      sourceEtag: doc.sourceEtag ?? '',
      sourceType: target.sourceType,
      sourceName: target.source ?? undefined,
      isUpdate: true,
    } satisfies ProcessFileJobData);

    return { data: updated };
  }

  /** Delete a document: remove vectors, delete source object, mark as deleted in DB. */
  async deleteDocument(id: string): Promise<Result<{ ok: true }>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);

    // Delete vectors
    await deleteDocumentVectors(this.deps.vectorStore, doc.id);

    // Delete source object if provider supports it
    if (target) {
      try {
        const provider = getProvider(target.sourceType);
        if (provider.deleteObject) {
          await provider.deleteObject(
            target.config as Record<string, unknown>,
            doc.sourceKey,
            target.source ?? undefined,
          );
        }
      } catch {
        // Source object deletion is best-effort
      }
    }

    await this.deps.documentRepo.markDeleted(id);

    return { data: { ok: true } };
  }

  /** Bulk delete documents: group by target, delete vectors + source, mark deleted. */
  async bulkDelete(ids: string[]): Promise<Result<{ ok: true; deleted: number }>> {
    const docs = await this.deps.documentRepo.findByIds(ids);
    if (docs.length === 0) return { data: { ok: true, deleted: 0 } };

    // Group by sync target for efficient provider resolution
    const byTarget = new Map<string, typeof docs>();
    for (const doc of docs) {
      const list = byTarget.get(doc.syncTargetId) ?? [];
      list.push(doc);
      byTarget.set(doc.syncTargetId, list);
    }

    let deleted = 0;
    for (const [syncTargetId, targetDocs] of byTarget) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: resolve target per group
      const target = await this.deps.syncTargetRepo.findById(syncTargetId);

      for (const doc of targetDocs) {
        // oxlint-disable-next-line no-await-in-loop -- sequential: delete vectors then S3 object per doc
        await deleteDocumentVectors(this.deps.vectorStore, doc.id);

        if (target) {
          try {
            const provider = getProvider(target.sourceType);
            if (provider.deleteObject) {
              // oxlint-disable-next-line no-await-in-loop -- sequential: paired with vector delete
              await provider.deleteObject(
                target.config as Record<string, unknown>,
                doc.sourceKey,
                target.source ?? undefined,
              );
            }
          } catch {
            // Best-effort
          }
        }
        deleted++;
      }

      const docIds = targetDocs.map((d) => d.id);
      // oxlint-disable-next-line no-await-in-loop -- sequential: bulk delete per target group
      await this.deps.documentRepo.bulkMarkDeleted(docIds);
    }

    return { data: { ok: true, deleted } };
  }

  /** Bulk purge documents: delete vectors + mark deleted, but keep source files in S3. */
  async bulkPurge(ids: string[]): Promise<Result<{ ok: true; purged: number }>> {
    const docs = await this.deps.documentRepo.findByIds(ids);
    if (docs.length === 0) return { data: { ok: true, purged: 0 } };

    for (const doc of docs) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: delete vectors per doc
      await deleteDocumentVectors(this.deps.vectorStore, doc.id);
    }

    await this.deps.documentRepo.bulkMarkDeleted(docs.map((d) => d.id));

    return { data: { ok: true, purged: docs.length } };
  }

  /** Move/rename a document's source key (S3 only). */
  async move(id: string, newSourceKey: string): Promise<Result<Record<string, unknown>>> {
    const doc = await this.deps.documentRepo.findById(id);
    if (!doc) return { error: 'Not found' };

    const target = await this.deps.syncTargetRepo.findById(doc.syncTargetId);
    if (!target) return { error: 'Sync target not found' };

    const provider = getProvider(target.sourceType);
    if (!provider.copyObject || !provider.deleteObject) {
      return { error: 'Move is not supported for this source type' };
    }

    const config = target.config as Record<string, unknown>;
    const sourceName = target.source ?? undefined;

    // Copy to new key
    await provider.copyObject(config, doc.sourceKey, newSourceKey, sourceName);

    // Update DB record
    const updated = await this.deps.documentRepo.update(id, { sourceKey: newSourceKey });

    // Update vector metadata
    await updateDocumentVectorSource(this.deps.sql, id, newSourceKey);

    // Delete old source object
    await provider.deleteObject(config, doc.sourceKey, sourceName);

    return { data: updated };
  }

  /** Introspect metadata fields across documents. */
  async getMetadataFields(syncTargetId?: string): Promise<Result<{ fields: unknown[] }>> {
    const fields = await this.deps.documentRepo.metadataFields(syncTargetId);
    return { data: { fields } };
  }
}
