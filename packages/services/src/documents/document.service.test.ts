import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOk } from '../test-helpers';
import type { DocumentServiceDeps } from './document.service';
import { DocumentService } from './document.service';

// ── Mock external modules ──────────────────────────────────────────

vi.mock('@typhoon/ingestion', () => ({
  buildSearchMetaFields: vi.fn().mockReturnValue({}),
  deleteDocumentVectors: vi.fn().mockResolvedValue(undefined),
  getParser: vi.fn(),
  getProvider: vi.fn(),
  needsCustomParser: vi.fn().mockReturnValue(false),
  refreshDocumentSearchMeta: vi.fn().mockResolvedValue(undefined),
  updateDocumentVectorMetadata: vi.fn().mockResolvedValue(undefined),
  updateDocumentVectorSource: vi.fn().mockResolvedValue(undefined),
  updateDocumentVectorTitle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@typhoon/types', () => ({
  validateCustomMetadata: vi.fn(),
}));

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
import { validateCustomMetadata } from '@typhoon/types';

// ── Helpers ────────────────────────────────────────────────────────

const now = new Date('2026-01-15T10:00:00Z');

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    syncTargetId: 'target-1',
    sourceKey: 'files/readme.md',
    sourceEtag: 'etag-abc',
    status: 'synced',
    title: 'README',
    description: 'A readme file',
    mimeType: 'text/markdown',
    contentHash: 'hash-123',
    customMetadata: { region: 'us' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    name: 'My Bucket',
    sourceType: 's3',
    config: { prefix: '' },
    source: 'my-source',
    metadataTemplateId: null,
    isActive: true,
    managedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockDeps(): DocumentServiceDeps {
  return {
    documentRepo: {
      findById: vi.fn().mockResolvedValue(null),
      listAll: vi.fn().mockResolvedValue([]),
      listBySyncTarget: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(null),
      markDeleted: vi.fn().mockResolvedValue(undefined),
      markProcessing: vi.fn().mockResolvedValue(null),
      bulkMarkDeleted: vi.fn().mockResolvedValue(undefined),
      findByIds: vi.fn().mockResolvedValue([]),
      metadataFields: vi.fn().mockResolvedValue([]),
    } as unknown as DocumentServiceDeps['documentRepo'],
    syncTargetRepo: {
      findById: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([]),
    } as unknown as DocumentServiceDeps['syncTargetRepo'],
    metadataRepo: {
      resolveEffectiveSchema: vi.fn().mockResolvedValue(null),
    } as unknown as DocumentServiceDeps['metadataRepo'],
    vectorStore: {
      getChunksByDocumentId: vi.fn().mockResolvedValue([]),
    } as unknown as DocumentServiceDeps['vectorStore'],
    syncQueue: {
      add: vi.fn().mockResolvedValue(undefined),
    } as unknown as DocumentServiceDeps['syncQueue'],
    sql: {
      unsafe: vi.fn().mockResolvedValue(undefined),
    } as unknown as DocumentServiceDeps['sql'],
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('DocumentService', () => {
  let deps: DocumentServiceDeps;
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new DocumentService(deps);
  });

  // ── getById ─────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the document when found', async () => {
      const doc = makeDoc();
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);

      const result = await service.getById('doc-1');

      expect(result).toEqual({ data: doc });
      expect(deps.documentRepo.findById).toHaveBeenCalledWith('doc-1');
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.getById('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });
  });

  // ── list ────────────────────────────────────────────────────────

  describe('list', () => {
    it('lists all documents when no syncTargetId provided', async () => {
      const docs = [makeDoc(), makeDoc({ id: 'doc-2' })];
      vi.mocked(deps.documentRepo.listAll).mockResolvedValue(docs as never);

      const result = await service.list();

      expect(result).toEqual({ data: docs });
      expect(deps.documentRepo.listAll).toHaveBeenCalled();
      expect(deps.documentRepo.listBySyncTarget).not.toHaveBeenCalled();
    });

    it('filters by syncTargetId when provided', async () => {
      const docs = [makeDoc()];
      vi.mocked(deps.documentRepo.listBySyncTarget).mockResolvedValue(docs as never);

      const result = await service.list('target-1');

      expect(result).toEqual({ data: docs });
      expect(deps.documentRepo.listBySyncTarget).toHaveBeenCalledWith('target-1');
      expect(deps.documentRepo.listAll).not.toHaveBeenCalled();
    });
  });

  // ── getChunks ───────────────────────────────────────────────────

  describe('getChunks', () => {
    it('returns document with its chunks', async () => {
      const doc = makeDoc();
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.vectorStore.getChunksByDocumentId).mockResolvedValue([
        { id: 'chunk-1', metadata: { text: 'Hello world', startIndex: 0 } },
        { id: 'chunk-2', metadata: { text: 'Second chunk', startIndex: 100 } },
      ]);

      const result = await service.getChunks('doc-1');

      const data = assertOk(result);
      expect(data.document).toEqual(doc);
      expect(data.chunks).toEqual([
        { text: 'Hello world', startIndex: 0 },
        { text: 'Second chunk', startIndex: 100 },
      ]);
      expect(deps.vectorStore.getChunksByDocumentId).toHaveBeenCalledWith('knowledge_base', 'doc-1');
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.getChunks('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('handles chunks with missing metadata fields', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc() as never);
      vi.mocked(deps.vectorStore.getChunksByDocumentId).mockResolvedValue([{ id: 'chunk-1', metadata: {} }]);

      const result = await service.getChunks('doc-1');

      const data = assertOk(result);
      expect(data.chunks).toEqual([{ text: '', startIndex: null }]);
    });
  });

  // ── updateMetadata ──────────────────────────────────────────────

  describe('updateMetadata', () => {
    it('updates title and description without validation when no template', async () => {
      const doc = makeDoc();
      const updated = makeDoc({ title: 'New Title', description: 'New desc' });
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.documentRepo.update).mockResolvedValue(updated as never);

      const result = await service.updateMetadata('doc-1', {
        title: 'New Title',
        description: 'New desc',
      });

      expect(result).toEqual({ data: updated });
      expect(deps.documentRepo.update).toHaveBeenCalledWith('doc-1', {
        title: 'New Title',
        description: 'New desc',
      });
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.updateMetadata('nonexistent', { title: 'X' });

      expect(result).toEqual({ error: 'Not found' });
    });

    it('validates customMetadata against template schema', async () => {
      const doc = makeDoc({ customMetadata: { region: 'us' } });
      const target = makeTarget({ metadataTemplateId: 'template-1' });
      const schema = { region: { type: 'string', required: true } };
      const updated = makeDoc({ customMetadata: { region: 'eu' } });

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchema).mockResolvedValue(schema as never);
      vi.mocked(validateCustomMetadata).mockReturnValue({
        valid: true,
        errors: [],
        normalized: { region: 'eu' },
      });
      vi.mocked(deps.documentRepo.update).mockResolvedValue(updated as never);

      const result = await service.updateMetadata('doc-1', {
        customMetadata: { region: 'eu' },
      });

      expect(result).toEqual({ data: updated });
      expect(validateCustomMetadata).toHaveBeenCalledWith({ region: 'eu' }, schema);
    });

    it('returns error when metadata validation fails', async () => {
      const doc = makeDoc();
      const target = makeTarget({ metadataTemplateId: 'template-1' });
      const schema = { region: { type: 'string', required: true } };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchema).mockResolvedValue(schema as never);
      vi.mocked(validateCustomMetadata).mockReturnValue({
        valid: false,
        errors: ['"region" must be a string, got number'],
        normalized: {},
      });

      const result = await service.updateMetadata('doc-1', {
        customMetadata: { region: 42 },
      });

      expect(result).toEqual({
        error: 'Metadata validation failed',
        details: ['"region" must be a string, got number'],
      });
      expect(deps.documentRepo.update).not.toHaveBeenCalled();
    });

    it('propagates title change to vector metadata', async () => {
      const doc = makeDoc({ title: 'Old Title' });
      const updated = makeDoc({ title: 'New Title' });
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.documentRepo.update).mockResolvedValue(updated as never);

      await service.updateMetadata('doc-1', { title: 'New Title' });

      expect(updateDocumentVectorTitle).toHaveBeenCalledWith(deps.sql, 'doc-1', 'New Title');
    });

    it('does not propagate title to vectors when unchanged', async () => {
      const doc = makeDoc({ title: 'Same Title' });
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.documentRepo.update).mockResolvedValue(doc as never);

      await service.updateMetadata('doc-1', { title: 'Same Title' });

      expect(updateDocumentVectorTitle).not.toHaveBeenCalled();
    });

    it('propagates customMetadata changes to vector metadata', async () => {
      const doc = makeDoc();
      const target = makeTarget({ metadataTemplateId: 'template-1' });
      const schema = { region: { type: 'string' } };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchema).mockResolvedValue(schema as never);
      vi.mocked(validateCustomMetadata).mockReturnValue({
        valid: true,
        errors: [],
        normalized: { region: 'eu' },
      });
      vi.mocked(deps.documentRepo.update).mockResolvedValue(makeDoc({ customMetadata: { region: 'eu' } }) as never);

      await service.updateMetadata('doc-1', {
        customMetadata: { region: 'eu' },
      });

      expect(updateDocumentVectorMetadata).toHaveBeenCalledWith(deps.sql, 'doc-1', { region: 'eu' });
    });

    it('rebuilds _searchMeta_* fields when customMetadata changes and schema exists', async () => {
      const doc = makeDoc();
      const target = makeTarget({ metadataTemplateId: 'template-1' });
      const schema = { region: { type: 'string', searchable: true, searchPriority: 'high' } };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchema).mockResolvedValue(schema as never);
      vi.mocked(validateCustomMetadata).mockReturnValue({
        valid: true,
        errors: [],
        normalized: { region: 'eu' },
      });
      vi.mocked(buildSearchMetaFields).mockReturnValue({ _searchMeta_B: 'eu' });
      vi.mocked(deps.documentRepo.update).mockResolvedValue(makeDoc({ customMetadata: { region: 'eu' } }) as never);

      await service.updateMetadata('doc-1', { customMetadata: { region: 'eu' } });

      expect(buildSearchMetaFields).toHaveBeenCalledWith({ region: 'eu' }, schema);
      expect(refreshDocumentSearchMeta).toHaveBeenCalledWith(deps.sql, 'doc-1', { _searchMeta_B: 'eu' });
    });

    it('does not rebuild _searchMeta_* when no template schema exists', async () => {
      const doc = makeDoc();

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.documentRepo.update).mockResolvedValue(makeDoc({ customMetadata: { foo: 'bar' } }) as never);

      await service.updateMetadata('doc-1', { customMetadata: { foo: 'bar' } });

      expect(buildSearchMetaFields).not.toHaveBeenCalled();
      expect(refreshDocumentSearchMeta).not.toHaveBeenCalled();
    });
  });

  // ── retryFailed ─────────────────────────────────────────────────

  describe('retryFailed', () => {
    it('re-queues a failed document for processing', async () => {
      const doc = makeDoc({ status: 'error' });
      const target = makeTarget();
      const processing = makeDoc({ status: 'processing' });

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(deps.documentRepo.markProcessing).mockResolvedValue(processing as never);

      const result = await service.retryFailed('doc-1');

      expect(result).toEqual({ data: processing });
      expect(deps.documentRepo.markProcessing).toHaveBeenCalledWith('doc-1');
      expect(deps.syncQueue.add).toHaveBeenCalledWith(
        'process-file',
        expect.objectContaining({
          syncTargetId: 'target-1',
          documentId: 'doc-1',
          sourceKey: 'files/readme.md',
          isUpdate: true,
        }),
      );
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.retryFailed('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('returns error when document is not in error state', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc({ status: 'synced' }) as never);

      const result = await service.retryFailed('doc-1');

      expect(result).toEqual({ error: 'Document is not in an error state' });
      expect(deps.syncQueue.add).not.toHaveBeenCalled();
    });

    it('returns error when sync target not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc({ status: 'error' }) as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.retryFailed('doc-1');

      expect(result).toEqual({ error: 'Sync target not found' });
    });
  });

  // ── resync ──────────────────────────────────────────────────────

  describe('resync', () => {
    it('re-queues a synced document for processing', async () => {
      const doc = makeDoc({ status: 'synced' });
      const target = makeTarget();
      const processing = makeDoc({ status: 'processing' });

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(deps.documentRepo.markProcessing).mockResolvedValue(processing as never);

      const result = await service.resync('doc-1');

      expect(result).toEqual({ data: processing });
      expect(deps.syncQueue.add).toHaveBeenCalledWith(
        'process-file',
        expect.objectContaining({
          syncTargetId: 'target-1',
          documentId: 'doc-1',
          isUpdate: true,
        }),
      );
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.resync('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('allows resyncing deleted documents', async () => {
      const doc = makeDoc({ status: 'deleted' });
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(makeTarget() as never);
      vi.mocked(deps.documentRepo.markProcessing).mockResolvedValue(doc as never);

      const result = await service.resync('doc-1');

      expect(result).toHaveProperty('data');
      expect(deps.syncQueue.add).toHaveBeenCalledWith('process-file', expect.objectContaining({ documentId: 'doc-1' }));
    });

    it('returns error for processing documents', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc({ status: 'processing' }) as never);

      const result = await service.resync('doc-1');

      expect(result).toEqual({ error: 'Document is already being processed' });
    });

    it('returns error for pending documents', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc({ status: 'pending' }) as never);

      const result = await service.resync('doc-1');

      expect(result).toEqual({ error: 'Document is already being processed' });
    });

    it('returns error when sync target not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc({ status: 'synced' }) as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.resync('doc-1');

      expect(result).toEqual({ error: 'Sync target not found' });
    });
  });

  // ── deleteDocument ──────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('deletes vectors, source, and marks document deleted', async () => {
      const doc = makeDoc();
      const target = makeTarget();
      const mockProvider = {
        deleteObject: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.deleteDocument('doc-1');

      expect(result).toEqual({ data: { ok: true } });
      expect(deleteDocumentVectors).toHaveBeenCalledWith(deps.vectorStore, 'doc-1');
      expect(mockProvider.deleteObject).toHaveBeenCalledWith(target.config, 'files/readme.md', 'my-source');
      expect(deps.documentRepo.markDeleted).toHaveBeenCalledWith('doc-1');
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.deleteDocument('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('still marks deleted when target not found (best-effort source deletion)', async () => {
      const doc = makeDoc();
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.deleteDocument('doc-1');

      expect(result).toEqual({ data: { ok: true } });
      expect(deleteDocumentVectors).toHaveBeenCalled();
      expect(deps.documentRepo.markDeleted).toHaveBeenCalledWith('doc-1');
    });

    it('still marks deleted when source deletion throws', async () => {
      const doc = makeDoc();
      const target = makeTarget();
      const mockProvider = {
        deleteObject: vi.fn().mockRejectedValue(new Error('S3 error')),
      };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.deleteDocument('doc-1');

      expect(result).toEqual({ data: { ok: true } });
      expect(deps.documentRepo.markDeleted).toHaveBeenCalledWith('doc-1');
    });

    it('handles providers without deleteObject', async () => {
      const doc = makeDoc();
      const target = makeTarget();
      const mockProvider = {};

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.deleteDocument('doc-1');

      expect(result).toEqual({ data: { ok: true } });
      expect(deps.documentRepo.markDeleted).toHaveBeenCalled();
    });
  });

  // ── bulkDelete ──────────────────────────────────────────────────

  describe('bulkDelete', () => {
    it('groups documents by target and deletes all', async () => {
      const docs = [
        makeDoc({ id: 'doc-1', syncTargetId: 'target-1', sourceKey: 'a.md' }),
        makeDoc({ id: 'doc-2', syncTargetId: 'target-1', sourceKey: 'b.md' }),
        makeDoc({ id: 'doc-3', syncTargetId: 'target-2', sourceKey: 'c.md' }),
      ];
      const target1 = makeTarget({ id: 'target-1' });
      const target2 = makeTarget({ id: 'target-2' });
      const mockProvider = {
        deleteObject: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(deps.documentRepo.findByIds).mockResolvedValue(docs as never);
      vi.mocked(deps.syncTargetRepo.findById)
        .mockResolvedValueOnce(target1 as never)
        .mockResolvedValueOnce(target2 as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.bulkDelete(['doc-1', 'doc-2', 'doc-3']);

      const data = assertOk(result);
      expect(data.deleted).toBe(3);
      expect(deleteDocumentVectors).toHaveBeenCalledTimes(3);
      expect(deps.documentRepo.bulkMarkDeleted).toHaveBeenCalledTimes(2);
    });

    it('returns zero deleted when no documents found', async () => {
      vi.mocked(deps.documentRepo.findByIds).mockResolvedValue([]);

      const result = await service.bulkDelete(['nonexistent']);

      expect(result).toEqual({ data: { ok: true, deleted: 0 } });
    });
  });

  // ── move ────────────────────────────────────────────────────────

  describe('move', () => {
    it('copies to new key, updates DB and vectors, deletes old', async () => {
      const doc = makeDoc();
      const target = makeTarget();
      const updated = makeDoc({ sourceKey: 'files/new-readme.md' });
      const mockProvider = {
        copyObject: vi.fn().mockResolvedValue(undefined),
        deleteObject: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(deps.documentRepo.update).mockResolvedValue(updated as never);

      const result = await service.move('doc-1', 'files/new-readme.md');

      expect(result).toEqual({ data: updated });
      expect(mockProvider.copyObject).toHaveBeenCalledWith(
        target.config,
        'files/readme.md',
        'files/new-readme.md',
        'my-source',
      );
      expect(deps.documentRepo.update).toHaveBeenCalledWith('doc-1', { sourceKey: 'files/new-readme.md' });
      expect(updateDocumentVectorSource).toHaveBeenCalledWith(deps.sql, 'doc-1', 'files/new-readme.md');
      expect(mockProvider.deleteObject).toHaveBeenCalledWith(target.config, 'files/readme.md', 'my-source');
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.move('nonexistent', 'new-key');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('returns error when sync target not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc() as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.move('doc-1', 'new-key');

      expect(result).toEqual({ error: 'Sync target not found' });
    });

    it('returns error when provider does not support move', async () => {
      const doc = makeDoc();
      const target = makeTarget();
      const mockProvider = {};

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.move('doc-1', 'new-key');

      expect(result).toEqual({ error: 'Move is not supported for this source type' });
    });
  });

  // ── getParsedContent ────────────────────────────────────────────

  describe('getParsedContent', () => {
    it('returns parsed text content', async () => {
      const doc = makeDoc({ contentHash: 'hash-123' });
      const target = makeTarget();
      const mockProvider = {
        download: vi.fn().mockResolvedValue(new Uint8Array(Buffer.from('Hello world'))),
      };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(needsCustomParser).mockReturnValue(false);

      const result = await service.getParsedContent('doc-1');

      const data = assertOk(result);
      expect(data).toHaveProperty('text');
      expect((data as { text: string; contentHash: string }).text).toBe('Hello world');
      expect((data as { text: string; contentHash: string }).contentHash).toBe('hash-123');
    });

    it('returns notModified when ETag matches', async () => {
      const doc = makeDoc({ contentHash: 'hash-123' });
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);

      const result = await service.getParsedContent('doc-1', 'hash-123');

      expect(result).toEqual({ data: { notModified: true } });
      expect(deps.syncTargetRepo.findById).not.toHaveBeenCalled();
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.getParsedContent('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('uses custom parser when needed', async () => {
      const doc = makeDoc({ sourceKey: 'file.pdf' });
      const target = makeTarget();
      const mockProvider = {
        download: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      };
      const mockParser = vi.fn().mockResolvedValue({ text: 'Parsed PDF content' });

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(needsCustomParser).mockReturnValue(true);
      vi.mocked(getParser).mockReturnValue(mockParser);

      const result = await service.getParsedContent('doc-1');

      const data = assertOk(result);
      expect((data as { text: string }).text).toBe('Parsed PDF content');
      expect(mockParser).toHaveBeenCalled();
    });

    it('returns error when no parser available', async () => {
      const doc = makeDoc({ sourceKey: 'file.xyz' });
      const target = makeTarget();
      const mockProvider = {
        download: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);
      vi.mocked(needsCustomParser).mockReturnValue(true);
      vi.mocked(getParser).mockReturnValue(undefined);

      const result = await service.getParsedContent('doc-1');

      expect(result).toEqual({ error: 'No parser available' });
    });
  });

  // ── download ────────────────────────────────────────────────────

  describe('download', () => {
    it('returns raw file content with metadata', async () => {
      const doc = makeDoc({ sourceKey: 'docs/guide.pdf', mimeType: 'application/pdf' });
      const target = makeTarget();
      const content = new Uint8Array([1, 2, 3]);
      const mockProvider = {
        download: vi.fn().mockResolvedValue(content),
      };

      vi.mocked(deps.documentRepo.findById).mockResolvedValue(doc as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(target as never);
      vi.mocked(getProvider).mockReturnValue(mockProvider as never);

      const result = await service.download('doc-1');

      const data = assertOk(result);
      expect(data.content).toBe(content);
      expect(data.mimeType).toBe('application/pdf');
      expect(data.filename).toBe('guide.pdf');
    });

    it('returns error when document not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(null as never);

      const result = await service.download('nonexistent');

      expect(result).toEqual({ error: 'Not found' });
    });

    it('returns error when sync target not found', async () => {
      vi.mocked(deps.documentRepo.findById).mockResolvedValue(makeDoc() as never);
      vi.mocked(deps.syncTargetRepo.findById).mockResolvedValue(null as never);

      const result = await service.download('doc-1');

      expect(result).toEqual({ error: 'Sync target not found' });
    });
  });

  // ── bulkUpdateMetadata ──────────────────────────────────────────

  describe('bulkUpdateMetadata', () => {
    it('returns zero updated when no documents found', async () => {
      vi.mocked(deps.documentRepo.findByIds).mockResolvedValue([]);

      const result = await service.bulkUpdateMetadata({
        ids: ['nonexistent'],
        customMetadata: { region: 'eu' },
        merge: true,
      });

      expect(result).toEqual({ data: { ok: true, updated: 0 } });
    });

    it('validates and updates each document against its template schema', async () => {
      const docs = [makeDoc({ id: 'doc-1', syncTargetId: 'target-1', customMetadata: { region: 'us' } })];
      const target = makeTarget({ id: 'target-1', metadataTemplateId: 'tmpl-1' });
      const schema = { region: { type: 'string' } };

      vi.mocked(deps.documentRepo.findByIds).mockResolvedValue(docs as never);
      vi.mocked(deps.syncTargetRepo.findByIds).mockResolvedValue([target] as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchema).mockResolvedValue(schema as never);
      vi.mocked(validateCustomMetadata).mockReturnValue({
        valid: true,
        errors: [],
        normalized: { region: 'eu' },
      });
      vi.mocked(deps.documentRepo.update).mockResolvedValue(makeDoc() as never);

      const result = await service.bulkUpdateMetadata({
        ids: ['doc-1'],
        customMetadata: { region: 'eu' },
        merge: true,
      });

      const data = assertOk(result);
      expect(data.updated).toBe(1);
      expect(deps.documentRepo.update).toHaveBeenCalledWith('doc-1', { customMetadata: { region: 'eu' } });
      expect(updateDocumentVectorMetadata).toHaveBeenCalledWith(deps.sql, 'doc-1', { region: 'eu' });
    });

    it('collects validation errors without stopping', async () => {
      const docs = [
        makeDoc({ id: 'doc-1', syncTargetId: 'target-1' }),
        makeDoc({ id: 'doc-2', syncTargetId: 'target-1' }),
      ];
      const target = makeTarget({ id: 'target-1', metadataTemplateId: 'tmpl-1' });
      const schema = { region: { type: 'string', required: true } };

      vi.mocked(deps.documentRepo.findByIds).mockResolvedValue(docs as never);
      vi.mocked(deps.syncTargetRepo.findByIds).mockResolvedValue([target] as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchema).mockResolvedValue(schema as never);
      vi.mocked(validateCustomMetadata)
        .mockReturnValueOnce({ valid: false, errors: ['bad region'], normalized: {} })
        .mockReturnValueOnce({ valid: true, errors: [], normalized: { region: 'eu' } });
      vi.mocked(deps.documentRepo.update).mockResolvedValue(makeDoc() as never);

      const result = await service.bulkUpdateMetadata({
        ids: ['doc-1', 'doc-2'],
        customMetadata: { region: 'eu' },
        merge: false,
      });

      const data = assertOk(result);
      expect(data.updated).toBe(1);
      expect(data.errors).toEqual(['Document doc-1: bad region']);
    });
  });

  // ── getMetadataFields ───────────────────────────────────────────

  describe('getMetadataFields', () => {
    it('returns metadata fields from documentRepo', async () => {
      const fields = [{ key: 'region', values: ['us', 'eu'], count: 5 }];
      vi.mocked(deps.documentRepo.metadataFields).mockResolvedValue(fields);

      const result = await service.getMetadataFields('target-1');

      expect(result).toEqual({ data: { fields } });
      expect(deps.documentRepo.metadataFields).toHaveBeenCalledWith('target-1');
    });

    it('calls without filter when no syncTargetId provided', async () => {
      vi.mocked(deps.documentRepo.metadataFields).mockResolvedValue([]);

      await service.getMetadataFields();

      expect(deps.documentRepo.metadataFields).toHaveBeenCalledWith(undefined);
    });
  });
});
