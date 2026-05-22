/**
 * Integration tests for DocumentService.
 * Uses real database repos; mocks external dependencies (vector store, queue, ingestion, sql.unsafe).
 */
import { DocumentRepo, MetadataRepo, SyncTargetRepo } from '@typhoon/db/repos';
import { clearAllTables, createTestConnection, seedDocument, seedSyncTarget } from '@typhoon/db/repos/test-utils';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import { DocumentService } from './document.service';

// Mock external dependencies that touch S3/vectors
vi.mock('@typhoon/ingestion', () => ({
  buildSearchMetaFields: vi.fn().mockReturnValue({}),
  deleteDocumentVectors: vi.fn(),
  getParser: vi.fn(),
  getProvider: vi.fn(),
  needsCustomParser: vi.fn().mockReturnValue(false),
  refreshDocumentSearchMeta: vi.fn(),
  updateDocumentVectorMetadata: vi.fn(),
  updateDocumentVectorSource: vi.fn(),
  updateDocumentVectorTitle: vi.fn(),
}));

describe('DocumentService (integration)', () => {
  const { db, sql } = createTestConnection();

  const mockVectorStore = {
    getChunksByDocumentId: vi.fn().mockResolvedValue([]),
    deleteVectors: vi.fn(),
  };

  const mockSyncQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockSql = { unsafe: vi.fn() };

  const service = new DocumentService({
    documentRepo: new DocumentRepo(db),
    syncTargetRepo: new SyncTargetRepo(db),
    metadataRepo: new MetadataRepo(db),
    vectorStore: mockVectorStore as any,
    syncQueue: mockSyncQueue as any,
    sql: mockSql as any,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns document when found', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { title: 'My Doc' });

      const data = assertOk(await service.getById(doc.id));
      expect(data.id).toBe(doc.id);
      expect(data.title).toBe('My Doc');
    });

    it('returns error when not found', async () => {
      const error = assertErr(await service.getById('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('Not found');
    });
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all documents', async () => {
      const target = await seedSyncTarget(db);
      await seedDocument(db, target.id);
      await seedDocument(db, target.id);

      const data = assertOk(await service.list());
      expect(data.length).toBe(2);
    });

    it('filters by syncTargetId', async () => {
      const target1 = await seedSyncTarget(db);
      const target2 = await seedSyncTarget(db);
      await seedDocument(db, target1.id);
      await seedDocument(db, target2.id);
      await seedDocument(db, target2.id);

      const data = assertOk(await service.list(target2.id));
      expect(data.length).toBe(2);
    });

    it('returns empty array when no documents', async () => {
      const data = assertOk(await service.list());
      expect(data).toEqual([]);
    });
  });

  // ── updateMetadata ───────────────────────────────────────────────────────

  describe('updateMetadata', () => {
    it('updates title', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { title: 'Old Title' });

      const data = assertOk(await service.updateMetadata(doc.id, { title: 'New Title' }));
      expect(data.title).toBe('New Title');
    });

    it('updates description', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id);

      const data = assertOk(await service.updateMetadata(doc.id, { description: 'A description' }));
      expect(data.description).toBe('A description');
    });

    it('sets title to null', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { title: 'Has title' });

      const data = assertOk(await service.updateMetadata(doc.id, { title: null }));
      expect(data.title).toBeNull();
    });

    it('returns error when document not found', async () => {
      const error = assertErr(await service.updateMetadata('00000000-0000-0000-0000-000000000000', { title: 'X' }));
      expect(error).toBe('Not found');
    });
  });

  // ── retryFailed ──────────────────────────────────────────────────────────

  describe('retryFailed', () => {
    it('enqueues retry for error-status document', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { status: 'error', errorMessage: 'parse failed' });

      const data = assertOk(await service.retryFailed(doc.id));
      // retryFailed marks as processing and enqueues
      expect(['pending', 'processing']).toContain(data.status);
      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('rejects non-error-status document', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { status: 'ready' });

      const error = assertErr(await service.retryFailed(doc.id));
      expect(error).toBeTruthy();
    });

    it('returns error when document not found', async () => {
      const error = assertErr(await service.retryFailed('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('Not found');
    });
  });

  // ── resync ───────────────────────────────────────────────────────────────

  describe('resync', () => {
    it('enqueues resync for ready document', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { status: 'ready' });

      const data = assertOk(await service.resync(doc.id));
      // resync marks as processing and enqueues
      expect(['pending', 'processing']).toContain(data.status);
      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('allows resync for deleted document', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id, { status: 'deleted' });

      const data = assertOk(await service.resync(doc.id));
      expect(['pending', 'processing']).toContain(data.status);
    });

    it('returns error when document not found', async () => {
      const error = assertErr(await service.resync('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('Not found');
    });
  });

  // ── deleteDocument ───────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('marks document as deleted', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id);

      assertOk(await service.deleteDocument(doc.id));

      // Verify the document status changed
      const result = assertOk(await service.getById(doc.id));
      expect(result.status).toBe('deleted');
    });

    it('returns error when document not found', async () => {
      const error = assertErr(await service.deleteDocument('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('Not found');
    });
  });

  // ── getChunks ────────────────────────────────────────────────────────────

  describe('getChunks', () => {
    it('returns document with empty chunks', async () => {
      const target = await seedSyncTarget(db);
      const doc = await seedDocument(db, target.id);

      const data = assertOk(await service.getChunks(doc.id));
      expect(data.document.id).toBe(doc.id);
      expect(data.chunks).toEqual([]);
    });

    it('returns error when document not found', async () => {
      const error = assertErr(await service.getChunks('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('Not found');
    });
  });
});
