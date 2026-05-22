import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOk } from '../test-helpers';
import type { SyncTargetServiceDeps } from './sync-target.service';
import { SyncTargetService } from './sync-target.service';

// ── Mock external modules ──────────────────────────────────────────

vi.mock('@typhoon/ingestion', () => ({
  deleteDocumentVectors: vi.fn().mockResolvedValue(undefined),
  getProvider: vi.fn(),
  listSources: vi.fn().mockReturnValue([]),
  updateDocumentVectorSource: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@typhoon/types', () => ({
  syncTargetConfigSchemas: {},
}));

vi.mock('@typhoon/queue', () => ({
  JOB_PRIORITY: { MANUAL: 1, UPLOAD: 2, CRON: 3, CHILD_MANUAL: 10, CHILD_CRON: 15 },
  makeJobId: vi.fn((...parts: string[]) => parts.join(':')),
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { deleteDocumentVectors, getProvider, listSources } from '@typhoon/ingestion';
import { syncTargetConfigSchemas } from '@typhoon/types';

// ── Helpers ────────────────────────────────────────────────────────

const now = new Date('2026-01-15T10:00:00Z');

function makeTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    name: 'My Bucket',
    sourceType: 's3',
    config: { prefix: 'docs/' },
    source: 'my-source',
    isActive: true,
    managedBy: null,
    metadataTemplateId: null,
    cronSchedule: '0 */6 * * *',
    autoExtractMetadata: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockDeps(): SyncTargetServiceDeps {
  return {
    syncTargetRepo: {
      findById: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
      listAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as SyncTargetServiceDeps['syncTargetRepo'],
    syncJobRepo: {
      findRunning: vi.fn().mockResolvedValue([]),
      listByTargetId: vi.fn().mockResolvedValue([]),
    } as unknown as SyncTargetServiceDeps['syncJobRepo'],
    documentRepo: {
      listIdsBySyncTargetId: vi.fn().mockResolvedValue([]),
      listNonDeletedBySyncTargetId: vi.fn().mockResolvedValue([]),
      bulkMarkDeleted: vi.fn().mockResolvedValue(undefined),
      upsertBySourceKey: vi.fn().mockResolvedValue(null),
      findBySyncTargetAndSourceKeys: vi.fn().mockResolvedValue([]),
      listBySourceKeyPrefix: vi.fn().mockResolvedValue([]),
      updateSourceKey: vi.fn().mockResolvedValue(null),
    } as unknown as SyncTargetServiceDeps['documentRepo'],
    metadataRepo: {
      resolveEffectiveSchema: vi.fn().mockResolvedValue(null),
    } as unknown as SyncTargetServiceDeps['metadataRepo'],
    vectorStore: {} as unknown as SyncTargetServiceDeps['vectorStore'],
    syncQueue: {
      add: vi.fn().mockResolvedValue(undefined),
    } as unknown as SyncTargetServiceDeps['syncQueue'],
    db: {} as unknown as SyncTargetServiceDeps['db'],
    sql: {} as unknown as SyncTargetServiceDeps['sql'],
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('SyncTargetService', () => {
  let deps: SyncTargetServiceDeps;
  let service: SyncTargetService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new SyncTargetService(deps);
  });

  // ── listSources ─────────────────────────────────────────────────

  describe('listSources', () => {
    it('returns sources with config but without credentials', () => {
      vi.mocked(listSources).mockReturnValue([
        { name: 'My S3', sourceType: 's3', credentials: { key: 'val' }, config: { bucket: 'docs' } },
        { name: 'My Confluence', sourceType: 'confluence', credentials: {}, config: {} },
      ] as never);

      const result = service.listSources();

      expect(result).toEqual([
        { name: 'My S3', sourceType: 's3', config: { bucket: 'docs' } },
        { name: 'My Confluence', sourceType: 'confluence', config: {} },
      ]);
    });
  });

  // ── list ────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all sync targets', async () => {
      const targets = [makeTarget(), makeTarget({ id: 'target-2' })];
      vi.mocked(deps.syncTargetRepo.listAll).mockResolvedValue(targets as never);

      const result = await service.list();

      expect(result).toEqual({ data: targets });
      expect(deps.syncTargetRepo.listAll).toHaveBeenCalled();
    });
  });

  // ── getById ─────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns target when found', async () => {
      const target = makeTarget();
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);

      const result = await service.getById('target-1');

      expect(result).toEqual({ data: target });
      expect(deps.syncTargetRepo.findById).toHaveBeenCalledWith('target-1');
    });

    it('returns error when not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.getById('nonexistent');

      expect(result).toEqual({ error: 'not-found' });
    });
  });

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a sync target successfully', async () => {
      const created = makeTarget();
      vi.mocked(deps.syncTargetRepo.create).mockResolvedValue(created);

      const result = await service.create({
        name: 'My Bucket',
        sourceType: 's3',
        config: { prefix: 'docs/' },
      });

      const data = assertOk(result);
      expect(data.target).toEqual(created);
      expect(data._status).toBe(201);
      expect(deps.syncTargetRepo.create).toHaveBeenCalledWith({
        name: 'My Bucket',
        sourceType: 's3',
        config: { prefix: 'docs/' },
      });
    });

    it('validates config against source-type schema when present', async () => {
      const mockSchema = {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { issues: [{ path: ['unknown'], message: 'Unrecognized key' }] },
        }),
      };
      (syncTargetConfigSchemas as Record<string, unknown>).s3 = mockSchema;

      const result = await service.create({
        name: 'Bad Config',
        sourceType: 's3',
        config: { unknown: 'x' },
      });

      expect(result).toEqual({ error: 'Invalid config: unknown: Unrecognized key' });
      expect(deps.syncTargetRepo.create).not.toHaveBeenCalled();

      // Cleanup
      delete (syncTargetConfigSchemas as Record<string, unknown>).s3;
    });

    it('passes config validation when schema succeeds', async () => {
      const created = makeTarget();
      const mockSchema = {
        safeParse: vi.fn().mockReturnValue({ success: true, data: { prefix: 'ok/' } }),
      };
      (syncTargetConfigSchemas as Record<string, unknown>).s3 = mockSchema;
      vi.mocked(deps.syncTargetRepo.create).mockResolvedValue(created);

      const result = await service.create({
        name: 'Good Config',
        sourceType: 's3',
        config: { prefix: 'ok/' },
      });

      const data = assertOk(result);
      expect(data.target).toEqual(created);

      // Cleanup
      delete (syncTargetConfigSchemas as Record<string, unknown>).s3;
    });

    it('skips config validation when no schema exists for source type', async () => {
      const created = makeTarget({ sourceType: 'custom' });
      vi.mocked(deps.syncTargetRepo.create).mockResolvedValue(created);

      const result = await service.create({
        name: 'Custom Source',
        sourceType: 'custom',
        config: { url: 'http://example.com' },
      });

      assertOk(result);
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a sync target successfully', async () => {
      const target = makeTarget();
      const updated = makeTarget({ name: 'Updated Name' });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(deps.syncTargetRepo.update).mockResolvedValue(updated);

      const result = await service.update('target-1', { name: 'Updated Name' });

      expect(result).toEqual({ data: updated });
      expect(deps.syncTargetRepo.update).toHaveBeenCalledWith('target-1', { name: 'Updated Name' });
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.update('nonexistent', { name: 'X' });

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error for config-managed targets', async () => {
      const target = makeTarget({ managedBy: 'config' });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);

      const result = await service.update('target-1', { name: 'Can not edit' });

      expect(result).toEqual({ error: 'config-managed-edit' });
      expect(deps.syncTargetRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes target and all its document vectors', async () => {
      const target = makeTarget();
      const docs = [{ id: 'doc-1' }, { id: 'doc-2' }];
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(deps.documentRepo.listIdsBySyncTargetId).mockResolvedValue(docs as never);

      const result = await service.delete('target-1');

      expect(result).toEqual({ data: { ok: true } });
      expect(deleteDocumentVectors).toHaveBeenCalledTimes(2);
      expect(deleteDocumentVectors).toHaveBeenCalledWith(deps.vectorStore, 'doc-1');
      expect(deleteDocumentVectors).toHaveBeenCalledWith(deps.vectorStore, 'doc-2');
      expect(deps.syncTargetRepo.delete).toHaveBeenCalledWith('target-1');
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.delete('nonexistent');

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error for config-managed targets', async () => {
      const target = makeTarget({ managedBy: 'config' });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);

      const result = await service.delete('target-1');

      expect(result).toEqual({ error: 'config-managed-delete' });
      expect(deps.syncTargetRepo.delete).not.toHaveBeenCalled();
    });

    it('still deletes when no documents exist', async () => {
      const target = makeTarget();
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(deps.documentRepo.listIdsBySyncTargetId).mockResolvedValue([]);

      const result = await service.delete('target-1');

      expect(result).toEqual({ data: { ok: true } });
      expect(deleteDocumentVectors).not.toHaveBeenCalled();
      expect(deps.syncTargetRepo.delete).toHaveBeenCalledWith('target-1');
    });
  });

  // ── sync ────────────────────────────────────────────────────────

  describe('sync', () => {
    it('enqueues a scan job for an active target', async () => {
      const target = makeTarget({ isActive: true });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);

      const result = await service.sync('target-1');

      const data = assertOk(result);
      expect(data.ok).toBe(true);
      expect(data.message).toContain('My Bucket');
      expect(deps.syncQueue.add).toHaveBeenCalledWith(
        'scan',
        { syncTargetId: 'target-1', force: false },
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('passes force flag to the scan job', async () => {
      const target = makeTarget({ isActive: true });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);

      await service.sync('target-1', true);

      expect(deps.syncQueue.add).toHaveBeenCalledWith(
        'scan',
        { syncTargetId: 'target-1', force: true },
        expect.anything(),
      );
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.sync('nonexistent');

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error when target is inactive', async () => {
      const target = makeTarget({ isActive: false });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);

      const result = await service.sync('target-1');

      expect(result).toEqual({ error: 'inactive' });
      expect(deps.syncQueue.add).not.toHaveBeenCalled();
    });

    it('returns error when a sync is already running for the target', async () => {
      const target = makeTarget({ isActive: true });
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(deps.syncJobRepo.findRunning).mockResolvedValue([{ id: 'job-1', status: 'running' }] as never);

      const result = await service.sync('target-1');

      expect(result).toEqual({ error: 'sync-already-running' });
      expect(deps.syncQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── purge ───────────────────────────────────────────────────────

  describe('purge', () => {
    it('purges all non-deleted documents for a target', async () => {
      const target = makeTarget();
      const docs = [
        { id: 'doc-1', sourceKey: 'a.md' },
        { id: 'doc-2', sourceKey: 'b.md' },
      ];
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(deps.documentRepo.listNonDeletedBySyncTargetId).mockResolvedValue(docs as never);

      const result = await service.purge('target-1');

      const data = assertOk(result);
      expect(data.purged).toBe(2);
      expect(deleteDocumentVectors).toHaveBeenCalledTimes(2);
      expect(deps.documentRepo.bulkMarkDeleted).toHaveBeenCalledWith(['doc-1', 'doc-2']);
    });

    it('returns zero purged when no documents exist', async () => {
      const target = makeTarget();
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(deps.documentRepo.listNonDeletedBySyncTargetId).mockResolvedValue([]);

      const result = await service.purge('target-1');

      expect(result).toEqual({ data: { ok: true, purged: 0 } });
      expect(deleteDocumentVectors).not.toHaveBeenCalled();
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.purge('nonexistent');

      expect(result).toEqual({ error: 'not-found' });
    });
  });

  // ── listJobs ────────────────────────────────────────────────────

  describe('listJobs', () => {
    it('delegates to syncJobRepo', async () => {
      const jobs = [{ id: 'job-1', status: 'completed' }];
      vi.mocked(deps.syncJobRepo.listByTargetId).mockResolvedValue(jobs as never);

      const result = await service.listJobs('target-1');

      expect(result).toEqual({ data: jobs });
      expect(deps.syncJobRepo.listByTargetId).toHaveBeenCalledWith('target-1');
    });
  });

  // ── browse ──────────────────────────────────────────────────────

  describe('browse', () => {
    it('returns enriched file listing', async () => {
      const target = makeTarget();
      const mockProvider = {
        browse: vi.fn().mockResolvedValue({
          folders: ['subfolder/'],
          objects: [{ key: 'docs/readme.md', size: 1024, lastModified: now }],
        }),
      };
      const dbDoc = { id: 'doc-1', sourceKey: 'docs/readme.md', status: 'synced' };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.findBySyncTargetAndSourceKeys).mockResolvedValue([dbDoc] as never);

      const result = await service.browse('target-1', 'docs/');

      const data = assertOk(result);
      expect(data.path).toBe('docs/');
      expect(data.folders).toEqual(['subfolder/']);
      expect(data.files).toHaveLength(1);
      expect(data.files[0].document).toEqual(dbDoc);
    });

    it('returns null document for files not in DB', async () => {
      const target = makeTarget();
      const mockProvider = {
        browse: vi.fn().mockResolvedValue({
          folders: [],
          objects: [{ key: 'new-file.md', size: 512, lastModified: now }],
        }),
      };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.findBySyncTargetAndSourceKeys).mockResolvedValue([]);

      const result = await service.browse('target-1', '');

      const data = assertOk(result);
      expect(data.files[0].document).toBeNull();
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.browse('nonexistent', '');

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error when browse not supported', async () => {
      const target = makeTarget();
      const mockProvider = {};

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.browse('target-1', '');

      expect(result).toEqual({ error: 'browse-not-supported' });
    });
  });

  // ── upload ──────────────────────────────────────────────────────

  describe('upload', () => {
    it('uploads files and enqueues processing jobs', async () => {
      const target = makeTarget();
      const mockProvider = {
        upload: vi.fn().mockResolvedValue(undefined),
      };
      const doc = {
        id: 'doc-new',
        sourceKey: 'docs/hello.txt',
        createdAt: now,
        updatedAt: now,
      };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.upsertBySourceKey).mockResolvedValue(doc as never);

      const files = [{ name: 'hello.txt', content: Buffer.from('Hello'), size: 5, type: 'text/plain' }];
      const result = await service.upload('target-1', files);

      const data = assertOk(result);
      expect(data._status).toBe(201);
      expect(data.docs).toHaveLength(1);
      expect(mockProvider.upload).toHaveBeenCalledWith(
        target.config,
        'docs/hello.txt',
        Buffer.from('Hello'),
        'text/plain',
        'my-source',
      );
      expect(deps.syncQueue.add).toHaveBeenCalledWith(
        'process-file',
        expect.objectContaining({
          syncTargetId: 'target-1',
          documentId: 'doc-new',
          sourceKey: 'docs/hello.txt',
        }),
        expect.objectContaining({ priority: 2 }),
      );
    });

    it('handles subPath normalization', async () => {
      const target = makeTarget({ config: { prefix: 'root' } });
      const mockProvider = {
        upload: vi.fn().mockResolvedValue(undefined),
      };
      const doc = { id: 'doc-new', sourceKey: 'root/sub/dir/file.md', createdAt: now, updatedAt: now };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.upsertBySourceKey).mockResolvedValue(doc as never);

      const files = [{ name: 'file.md', content: Buffer.from('data'), size: 4, type: 'text/markdown' }];
      await service.upload('target-1', files, '/sub/dir/');

      expect(mockProvider.upload).toHaveBeenCalledWith(
        target.config,
        'root/sub/dir/file.md',
        expect.anything(),
        'text/markdown',
        'my-source',
      );
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.upload('nonexistent', []);

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error when upload not supported', async () => {
      const target = makeTarget();
      const mockProvider = {};

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.upload('target-1', [
        { name: 'a.txt', content: Buffer.from('x'), size: 1, type: '' },
      ]);

      expect(result).toEqual({ error: 'upload-not-supported' });
    });

    it('returns error when no files provided', async () => {
      const target = makeTarget();
      const mockProvider = { upload: vi.fn() };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.upload('target-1', []);

      expect(result).toEqual({ error: 'no-files' });
    });

    it('detects update when createdAt != updatedAt', async () => {
      const target = makeTarget();
      const mockProvider = { upload: vi.fn().mockResolvedValue(undefined) };
      const laterTime = new Date('2026-01-15T11:00:00Z');
      const doc = { id: 'doc-existing', sourceKey: 'docs/a.txt', createdAt: now, updatedAt: laterTime };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.upsertBySourceKey).mockResolvedValue(doc as never);

      const files = [{ name: 'a.txt', content: Buffer.from('x'), size: 1, type: 'text/plain' }];
      await service.upload('target-1', files);

      expect(deps.syncQueue.add).toHaveBeenCalledWith(
        'process-file',
        expect.objectContaining({ isUpdate: true }),
        expect.anything(),
      );
    });
  });

  // ── createFolder ────────────────────────────────────────────────

  describe('createFolder', () => {
    it('creates a folder in the source', async () => {
      const target = makeTarget();
      const mockProvider = { createFolder: vi.fn().mockResolvedValue(undefined) };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.createFolder('target-1', 'new-folder/');

      expect(result).toEqual({ data: { ok: true, path: 'new-folder/' } });
      expect(mockProvider.createFolder).toHaveBeenCalledWith(target.config, 'docs/new-folder/', 'my-source');
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.createFolder('nonexistent', 'x/');

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error when createFolder not supported', async () => {
      const target = makeTarget();
      const mockProvider = {};

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.createFolder('target-1', 'x/');

      expect(result).toEqual({ error: 'create-folder-not-supported' });
    });
  });

  // ── deleteFolder ────────────────────────────────────────────────

  describe('deleteFolder', () => {
    it('deletes folder documents, vectors, and placeholder', async () => {
      const target = makeTarget();
      const docs = [
        { id: 'doc-1', sourceKey: 'docs/folder/a.md' },
        { id: 'doc-2', sourceKey: 'docs/folder/b.md' },
      ];
      const mockProvider = {
        deleteObject: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.listBySourceKeyPrefix).mockResolvedValue(docs as never);

      const result = await service.deleteFolder('target-1', 'folder/');

      const data = assertOk(result);
      expect(data.deleted).toBe(2);
      expect(deleteDocumentVectors).toHaveBeenCalledTimes(2);
      expect(deps.documentRepo.bulkMarkDeleted).toHaveBeenCalledWith(['doc-1', 'doc-2']);
      // Source objects + folder placeholder
      expect(mockProvider.deleteObject).toHaveBeenCalledTimes(3);
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.deleteFolder('nonexistent', 'x/');

      expect(result).toEqual({ error: 'not-found' });
    });
  });

  // ── moveFolder ──────────────────────────────────────────────────

  describe('moveFolder', () => {
    it('moves all objects under a prefix to a new prefix', async () => {
      const target = makeTarget();
      const mockProvider = {
        copyObject: vi.fn().mockResolvedValue(undefined),
        deleteObject: vi.fn().mockResolvedValue(undefined),
        listObjects: vi.fn().mockResolvedValue([
          { key: 'docs/old/a.md', size: 100, lastModified: now },
          { key: 'docs/old/b.md', size: 200, lastModified: now },
          { key: 'docs/other/c.md', size: 50, lastModified: now },
        ]),
      };
      const movedDoc = { id: 'doc-1', sourceKey: 'docs/new/a.md' };

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.updateSourceKey)
        .mockResolvedValueOnce(movedDoc as never)
        .mockResolvedValueOnce(null as never);

      const result = await service.moveFolder('target-1', 'old/', 'new/');

      const data = assertOk(result);
      expect(data.moved).toBe(2);
      expect(mockProvider.copyObject).toHaveBeenCalledTimes(2);
      expect(mockProvider.deleteObject).toHaveBeenCalledTimes(2);
    });

    it('returns error when target not found', async () => {
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.moveFolder('nonexistent', 'old/', 'new/');

      expect(result).toEqual({ error: 'not-found' });
    });

    it('returns error when move not supported', async () => {
      const target = makeTarget();
      const mockProvider = {};

      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.moveFolder('target-1', 'old/', 'new/');

      expect(result).toEqual({ error: 'move-folder-not-supported' });
    });
  });
});
