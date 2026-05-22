import type { Db } from '@typhoon/db';
import type { PgVector } from '@typhoon/db/drivers/pg';
import type { DocumentRepo, MetadataRepo, SyncJobRepo, SyncTargetRepo } from '@typhoon/db/repos';
import type { CredentialValue } from '@typhoon/ingestion';
import {
  buildSearchMetaFields,
  deleteDocumentVectors,
  getProvider,
  listSources,
  refreshDocumentSearchMeta,
  updateDocumentVectorSource,
} from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import type { ProcessFileJobData, ScanJobData } from '@typhoon/queue';
import { JOB_PRIORITY, makeJobId } from '@typhoon/queue';
import { syncTargetConfigSchemas } from '@typhoon/types';
import type { Queue } from 'bullmq';
import type { Sql } from 'postgres';

import type { Result } from '../types';

const log = createAppLogger('sync-target-service');

export interface SyncTargetServiceDeps {
  syncTargetRepo: SyncTargetRepo;
  syncJobRepo: SyncJobRepo;
  documentRepo: DocumentRepo;
  metadataRepo: MetadataRepo;
  vectorStore: PgVector;
  syncQueue: Queue;
  db: Db;
  sql: Sql;
}

export class SyncTargetService {
  constructor(private deps: SyncTargetServiceDeps) {}

  // ── Sources ─────────────────────────────────────────────────────

  /** List registered source providers (config exposed, credentials hidden). */
  listSources(): Array<{ name: string; sourceType: string; config: Record<string, CredentialValue> }> {
    return listSources().map(({ name, sourceType, config }) => ({ name, sourceType, config }));
  }

  // ── CRUD ────────────────────────────────────────────────────────

  /** List all sync targets. */
  async list(): Promise<Result<unknown[]>> {
    const targets = await this.deps.syncTargetRepo.listAll();
    return { data: targets };
  }

  /** Get a sync target by ID. */
  async getById(id: string): Promise<Result<unknown>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };
    return { data: target };
  }

  /** Create a new sync target after validating config against the source schema. */
  async create(input: {
    name: string;
    sourceType: string;
    config: Record<string, unknown>;
    cronSchedule?: string;
    isActive?: boolean;
    source?: string;
    metadataTemplateId?: string | null;
    autoExtractMetadata?: boolean;
  }): Promise<Result<{ target: unknown; _status: 201 }>> {
    // Validate config against source-type schema (if one exists)
    const configSchema = syncTargetConfigSchemas[input.sourceType];
    if (configSchema) {
      const result = configSchema.safeParse(input.config);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        return { error: `Invalid config: ${issues}` };
      }
    }

    const target = await this.deps.syncTargetRepo.create(input);
    log.info('Sync target created', { id: target.id, name: input.name });
    return { data: { target, _status: 201 } };
  }

  /** Update a sync target. Config-managed targets cannot be edited. */
  async update(
    id: string,
    input: Partial<{
      name: string;
      sourceType: string;
      config: Record<string, unknown>;
      cronSchedule: string;
      isActive: boolean;
      source: string;
      metadataTemplateId: string | null;
      autoExtractMetadata: boolean;
    }>,
  ): Promise<Result<unknown>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };
    if (target.managedBy === 'config') {
      log.warn('Attempt to modify config-managed target', { id });
      return { error: 'config-managed-edit' };
    }

    const updated = await this.deps.syncTargetRepo.update(id, input);
    return { data: updated };
  }

  /** Delete a sync target and all its document vectors. Config-managed targets cannot be deleted. */
  async delete(id: string): Promise<Result<{ ok: true }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };
    if (target.managedBy === 'config') {
      log.warn('Attempt to delete config-managed target', { id });
      return { error: 'config-managed-delete' };
    }

    // Delete vectors before cascade removes document rows
    const docs = await this.deps.documentRepo.listIdsBySyncTargetId(id);
    await Promise.all(docs.map((doc) => deleteDocumentVectors(this.deps.vectorStore, doc.id)));

    await this.deps.syncTargetRepo.delete(id);
    log.info('Sync target deleted', { id, documentsCleared: docs.length });
    return { data: { ok: true } };
  }

  // ── Sync operations ─────────────────────────────────────────────

  /** Trigger a manual sync scan for a target. */
  async sync(id: string, force = false): Promise<Result<{ ok: true; message: string }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };
    if (!target.isActive) return { error: 'inactive' };

    const running = await this.deps.syncJobRepo.findRunning(id);
    if (running.length > 0) {
      return { error: 'sync-already-running' };
    }

    await this.deps.syncQueue.add('scan', { syncTargetId: id, force } satisfies ScanJobData, {
      jobId: crypto.randomUUID(),
      priority: JOB_PRIORITY.MANUAL,
    });
    log.info('Manual sync triggered — scan job enqueued', { id, name: target.name, force });
    return { data: { ok: true, message: `Sync triggered for ${target.name}` } };
  }

  /** Purge all non-deleted documents for a target (delete vectors, mark deleted). */
  async purge(id: string): Promise<Result<{ ok: true; purged: number }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };

    const docs = await this.deps.documentRepo.listNonDeletedBySyncTargetId(id);
    if (docs.length === 0) {
      return { data: { ok: true, purged: 0 } };
    }

    await Promise.all(docs.map((doc) => deleteDocumentVectors(this.deps.vectorStore, doc.id)));

    const docIds = docs.map((d) => d.id);
    await this.deps.documentRepo.bulkMarkDeleted(docIds);

    log.info('Purge completed', { id, purged: docs.length });
    return { data: { ok: true, purged: docs.length } };
  }

  /** Refresh search index: recompute _searchMeta_* fields on all ready docs without re-embedding. */
  async refreshSearchIndex(id: string): Promise<Result<{ ok: true; documentsUpdated: number }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };
    if (!target.metadataTemplateId) return { error: 'no-template' };

    const schema = await this.deps.metadataRepo.resolveEffectiveSchema(target.metadataTemplateId);
    if (!schema) return { error: 'template-not-found' };

    const docs = await this.deps.documentRepo.listNonDeletedBySyncTargetId(id);
    let updated = 0;

    for (const doc of docs) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: need doc metadata before SQL update
      const fullDoc = await this.deps.documentRepo.findById(doc.id);
      if (!fullDoc) continue;

      const searchMetaFields = buildSearchMetaFields(fullDoc.customMetadata ?? {}, schema);
      // oxlint-disable-next-line no-await-in-loop -- sequential: SQL update per document
      await refreshDocumentSearchMeta(this.deps.sql, doc.id, searchMetaFields);
      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on refresh above
      await this.deps.documentRepo.clearSearchMetaDirty(doc.id);
      updated++;
    }

    log.info('Search index refreshed', { syncTargetId: id, documentsUpdated: updated });
    return { data: { ok: true, documentsUpdated: updated } };
  }

  /** List sync jobs for a target. */
  async listJobs(syncTargetId: string): Promise<Result<unknown[]>> {
    const jobs = await this.deps.syncJobRepo.listByTargetId(syncTargetId);
    return { data: jobs };
  }

  // ── File operations (S3-like providers) ─────────────────────────

  /** Upload files to a sync target's source and enqueue processing. */
  async upload(
    id: string,
    files: Array<{ name: string; content: Buffer; size: number; type: string }>,
    subPath?: string,
  ): Promise<Result<{ docs: unknown[]; _status: 201 }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };

    const provider = getProvider(target.sourceType);
    if (!provider.upload) {
      return { error: 'upload-not-supported' };
    }

    if (files.length === 0) {
      return { error: 'no-files' };
    }

    const config = target.config as Record<string, unknown>;
    const s3Config = config as { prefix?: string };
    const basePrefix = s3Config.prefix ? (s3Config.prefix.endsWith('/') ? s3Config.prefix : `${s3Config.prefix}/`) : '';
    const rawSubPath = subPath ? subPath.trim().replaceAll(/^\/+|\/+$/g, '') : '';
    const normalizedSubPath = rawSubPath ? `${rawSubPath}/` : '';
    const fullPrefix = `${basePrefix}${normalizedSubPath}`;

    const sourceName = target.source ?? undefined;
    const created = [];

    for (const file of files) {
      const sourceKey = `${fullPrefix}${file.name}`;

      // oxlint-disable-next-line no-await-in-loop -- sequential: upload then DB upsert then enqueue per file
      await provider.upload(config, sourceKey, file.content, file.type || undefined, sourceName);

      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on upload above
      const doc = await this.deps.documentRepo.upsertBySourceKey({
        syncTargetId: id,
        sourceKey,
        sourceEtag: '',
        fileSize: file.size,
        mimeType: file.type || null,
        status: 'processing',
        lastSyncedAt: new Date(),
      });

      const isUpdate = doc.createdAt.getTime() !== doc.updatedAt.getTime();

      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on doc ID from upsert above
      await this.deps.syncQueue.add(
        'process-file',
        {
          syncTargetId: id,
          documentId: doc.id,
          sourceKey,
          sourceEtag: '',
          sourceType: target.sourceType,
          sourceName,
          isUpdate,
        } satisfies ProcessFileJobData,
        { jobId: makeJobId('upload', id, sourceKey, String(Date.now())), priority: JOB_PRIORITY.UPLOAD },
      );

      created.push(doc);
    }

    log.info('Files uploaded', { syncTargetId: id, count: created.length });
    return { data: { docs: created, _status: 201 } };
  }

  /** Browse files in a sync target's source at a given path. */
  async browse(
    id: string,
    path: string,
  ): Promise<
    Result<{
      path: string;
      folders: string[];
      files: Array<{ sourceKey: string; size: number; lastModified: Date; document: unknown | null }>;
    }>
  > {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };

    const provider = getProvider(target.sourceType);
    if (!provider.browse) {
      return { error: 'browse-not-supported' };
    }

    const config = target.config as Record<string, unknown>;
    const sourceName = target.source ?? undefined;
    const result = await provider.browse(config, path, sourceName);

    // Enrich files with DB document info
    const sourceKeys = result.objects.map((o) => o.key);
    const dbDocs =
      sourceKeys.length > 0 ? await this.deps.documentRepo.findBySyncTargetAndSourceKeys(id, sourceKeys) : [];
    const docByKey = new Map(dbDocs.map((d) => [d.sourceKey, d]));

    const files = result.objects.map((obj) => ({
      sourceKey: obj.key,
      size: obj.size,
      lastModified: obj.lastModified,
      document: docByKey.get(obj.key) ?? null,
    }));

    return { data: { path, folders: result.folders, files } };
  }

  /** Create a folder in the sync target's source. */
  async createFolder(id: string, folderPath: string): Promise<Result<{ ok: true; path: string }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };

    const provider = getProvider(target.sourceType);
    if (!provider.createFolder) {
      return { error: 'create-folder-not-supported' };
    }

    const config = target.config as Record<string, unknown>;
    const s3Config = config as { prefix?: string };
    const basePrefix = s3Config.prefix ? (s3Config.prefix.endsWith('/') ? s3Config.prefix : `${s3Config.prefix}/`) : '';
    const fullPath = `${basePrefix}${folderPath}`;

    await provider.createFolder(config, fullPath, target.source ?? undefined);
    return { data: { ok: true, path: folderPath } };
  }

  /** Delete a folder and all documents under it from the source. */
  async deleteFolder(id: string, folderPath: string): Promise<Result<{ ok: true; deleted: number }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };

    const provider = getProvider(target.sourceType);
    if (!provider.deleteObject) {
      return { error: 'delete-folder-not-supported' };
    }

    const config = target.config as Record<string, unknown>;
    const s3Config = config as { prefix?: string };
    const basePrefix = s3Config.prefix ? (s3Config.prefix.endsWith('/') ? s3Config.prefix : `${s3Config.prefix}/`) : '';
    const fullPrefix = `${basePrefix}${folderPath}`;
    const sourceName = target.source ?? undefined;

    // Find all documents under this prefix
    const docs = await this.deps.documentRepo.listBySourceKeyPrefix(id, fullPrefix);

    // Delete vectors and source objects for each document
    for (const doc of docs) {
      // oxlint-disable-next-line no-await-in-loop -- sequential: delete vectors then S3 object per doc
      await deleteDocumentVectors(this.deps.vectorStore, doc.id);
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential: paired with vector delete above
        await provider.deleteObject(config, doc.sourceKey, sourceName);
      } catch {
        // Best-effort
      }
    }

    if (docs.length > 0) {
      const docIds = docs.map((d) => d.id);
      await this.deps.documentRepo.bulkMarkDeleted(docIds);
    }

    // Delete the folder placeholder itself
    try {
      const folderKey = fullPrefix.endsWith('/') ? fullPrefix : `${fullPrefix}/`;
      await provider.deleteObject(config, folderKey, sourceName);
    } catch {
      // Folder placeholder may not exist
    }

    return { data: { ok: true, deleted: docs.length } };
  }

  /** Move/rename a folder within the source. */
  async moveFolder(id: string, oldPath: string, newPath: string): Promise<Result<{ ok: true; moved: number }>> {
    const target = await this.deps.syncTargetRepo.findById(id);
    if (!target) return { error: 'not-found' };

    const provider = getProvider(target.sourceType);
    if (!provider.copyObject || !provider.deleteObject) {
      return { error: 'move-folder-not-supported' };
    }

    const config = target.config as Record<string, unknown>;
    const s3Config = config as { prefix?: string };
    const basePrefix = s3Config.prefix ? (s3Config.prefix.endsWith('/') ? s3Config.prefix : `${s3Config.prefix}/`) : '';
    const oldPrefix = `${basePrefix}${oldPath}`;
    const newPrefix = `${basePrefix}${newPath}`;
    const sourceName = target.source ?? undefined;

    // List all source objects under old prefix
    const allObjects = await provider.listObjects(config, sourceName);
    const objectsToMove = allObjects.filter((o) => o.key.startsWith(oldPrefix));

    let moved = 0;
    for (const obj of objectsToMove) {
      const newKey = `${newPrefix}${obj.key.slice(oldPrefix.length)}`;

      // oxlint-disable-next-line no-await-in-loop -- sequential: copy then delete then update DB per object
      await provider.copyObject(config, obj.key, newKey, sourceName);
      // oxlint-disable-next-line no-await-in-loop -- sequential: must follow copy
      await provider.deleteObject(config, obj.key, sourceName);

      // Update DB document if it exists
      // oxlint-disable-next-line no-await-in-loop -- sequential: depends on S3 operations above
      const doc = await this.deps.documentRepo.updateSourceKey(id, obj.key, newKey);

      if (doc) {
        // oxlint-disable-next-line no-await-in-loop -- sequential: depends on doc from update above
        await updateDocumentVectorSource(this.deps.sql, doc.id, newKey);
      }

      moved++;
    }

    return { data: { ok: true, moved } };
  }
}
