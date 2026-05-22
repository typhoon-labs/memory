/**
 * Integration tests for SyncTargetService.
 * Uses real database repos; mocks external dependencies (vector store, queue, ingestion).
 */
import { DocumentRepo, MetadataRepo, SyncJobRepo, SyncTargetRepo } from '@typhoon/db/repos';
import { clearAllTables, createTestConnection, seedDocument, seedSyncTarget } from '@typhoon/db/repos/test-utils';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import { SyncTargetService } from './sync-target.service';

// Mock external dependencies
vi.mock('@typhoon/ingestion', () => ({
  buildSearchMetaFields: vi.fn().mockReturnValue({}),
  deleteDocumentVectors: vi.fn(),
  getProvider: vi.fn(),
  listSources: vi.fn().mockReturnValue([]),
  refreshDocumentSearchMeta: vi.fn(),
  updateDocumentVectorSource: vi.fn(),
}));

describe('SyncTargetService (integration)', () => {
  const { db, sql } = createTestConnection();

  const mockVectorStore = {
    deleteIndex: vi.fn(),
    deleteVectors: vi.fn(),
  };

  const mockSyncQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const service = new SyncTargetService({
    syncTargetRepo: new SyncTargetRepo(db),
    syncJobRepo: new SyncJobRepo(db),
    documentRepo: new DocumentRepo(db),
    metadataRepo: new MetadataRepo(db),
    vectorStore: mockVectorStore as any,
    syncQueue: mockSyncQueue as any,
    db,
    sql,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── CRUD ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a sync target', async () => {
      const result = await service.create({
        name: 'Test Source',
        sourceType: 's3',
        config: { prefix: 'docs/' },
      });

      const data = assertOk(result) as any;
      expect(data.target.name).toBe('Test Source');
      expect(data.target.sourceType).toBe('s3');
      expect(data._status).toBe(201);
    });
  });

  describe('getById', () => {
    it('returns target when found', async () => {
      const { id } = await seedSyncTarget(db);

      const data = assertOk(await service.getById(id)) as any;
      expect(data.id).toBe(id);
    });

    it('returns not-found error', async () => {
      const error = assertErr(await service.getById('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('not-found');
    });
  });

  describe('list', () => {
    it('returns all targets', async () => {
      await seedSyncTarget(db);
      await seedSyncTarget(db);

      const data = assertOk(await service.list()) as any[];
      expect(data.length).toBe(2);
    });
  });

  describe('update', () => {
    it('updates a manual target', async () => {
      const created = assertOk(
        await service.create({
          name: 'Source',
          sourceType: 's3',
          config: { prefix: '' },
        }),
      ) as any;

      const data = assertOk(await service.update(created.target.id, { name: 'Updated' })) as any;
      expect(data.name).toBe('Updated');
    });

    it('rejects update of config-managed target', async () => {
      const created = assertOk(
        await service.create({
          name: 'Config Source',
          sourceType: 's3',
          config: { prefix: '' },
        }),
      ) as any;

      // Manually set managedBy to config
      await new SyncTargetRepo(db).update(created.target.id, { managedBy: 'config' });

      const error = assertErr(await service.update(created.target.id, { name: 'Renamed' }));
      expect(error).toBe('config-managed-edit');
    });

    it('returns not-found for missing target', async () => {
      const error = assertErr(await service.update('00000000-0000-0000-0000-000000000000', { name: 'X' }));
      expect(error).toBe('not-found');
    });
  });

  describe('delete', () => {
    it('deletes a manual target', async () => {
      const created = assertOk(
        await service.create({
          name: 'To Delete',
          sourceType: 's3',
          config: { prefix: '' },
        }),
      ) as any;

      assertOk(await service.delete(created.target.id));

      const error = assertErr(await service.getById(created.target.id));
      expect(error).toBe('not-found');
    });

    it('rejects delete of config-managed target', async () => {
      const created = assertOk(
        await service.create({
          name: 'Config Source',
          sourceType: 's3',
          config: { prefix: '' },
        }),
      ) as any;

      await new SyncTargetRepo(db).update(created.target.id, { managedBy: 'config' });

      const error = assertErr(await service.delete(created.target.id));
      expect(error).toBe('config-managed-delete');
    });
  });

  // ── Sync ─────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('enqueues a sync job for active target', async () => {
      const created = assertOk(
        await service.create({
          name: 'Sync Source',
          sourceType: 's3',
          config: { prefix: '' },
          source: 'test-s3',
        }),
      ) as any;

      const result = await service.sync(created.target.id);
      assertOk(result);
      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('rejects sync for inactive target', async () => {
      const created = assertOk(
        await service.create({
          name: 'Inactive Source',
          sourceType: 's3',
          config: { prefix: '' },
          isActive: false,
        }),
      ) as any;

      const error = assertErr(await service.sync(created.target.id));
      expect(error).toBe('inactive');
    });

    it('returns not-found for missing target', async () => {
      const error = assertErr(await service.sync('00000000-0000-0000-0000-000000000000'));
      expect(error).toBe('not-found');
    });
  });

  // ── Purge ────────────────────────────────────────────────────────────────

  describe('purge', () => {
    it('purges all documents for a target', async () => {
      const { id } = await seedSyncTarget(db);
      await seedDocument(db, id);
      await seedDocument(db, id);

      assertOk(await service.purge(id));

      // After purge, documents should be marked deleted
      const listResult = assertOk(
        await new (
          await import('../documents/document.service')
        ).DocumentService({
          documentRepo: new DocumentRepo(db),
          syncTargetRepo: new SyncTargetRepo(db),
          metadataRepo: new MetadataRepo(db),
          vectorStore: mockVectorStore as any,
          syncQueue: mockSyncQueue as any,
          sql: { unsafe: vi.fn() } as any,
        }).list(id),
      ) as any[];

      for (const doc of listResult) {
        expect(doc.status).toBe('deleted');
      }
    });
  });
});
