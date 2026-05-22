import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentRepo } from './document.repo';

/** Create a chainable mock that records calls on every accessed property. */
function createMockDb() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const makeChain = (): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get(_, prop) {
        if (prop === 'then') return undefined;
        chain[prop as string] ??= vi.fn().mockReturnValue(makeChain());
        return chain[prop as string];
      },
    });

  const db = {
    select: vi.fn().mockReturnValue(makeChain()),
    insert: vi.fn().mockReturnValue(makeChain()),
    update: vi.fn().mockReturnValue(makeChain()),
    delete: vi.fn().mockReturnValue(makeChain()),
    execute: vi.fn(),
    _chain: chain,
  };

  return db;
}

describe('DocumentRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: DocumentRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new DocumentRepo(db as any);
  });

  describe('findById', () => {
    it('returns the document when found', async () => {
      const doc = { id: 'doc-1', title: 'Test' };
      db._chain.where = vi.fn().mockResolvedValue([doc]);

      const result = await repo.findById('doc-1');
      expect(result).toEqual(doc);
      expect(db.select).toHaveBeenCalled();
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    it('calls select().from()', async () => {
      const docs = [{ id: '1' }, { id: '2' }];
      db._chain.from = vi.fn().mockResolvedValue(docs);

      const result = await repo.listAll();
      expect(result).toEqual(docs);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('listBySyncTarget', () => {
    it('calls select().from().where()', async () => {
      const docs = [{ id: '1', syncTargetId: 'st-1' }];
      db._chain.where = vi.fn().mockResolvedValue(docs);

      const result = await repo.listBySyncTarget('st-1');
      expect(result).toEqual(docs);
    });
  });

  describe('update', () => {
    it('returns updated document', async () => {
      const updated = { id: 'doc-1', title: 'Updated' };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.update('doc-1', { title: 'Updated' });
      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });

    it('returns null when no row matched', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.update('missing', { title: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('markDeleted', () => {
    it('calls update with deleted status', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.markDeleted('doc-1');
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('markProcessing', () => {
    it('returns updated document', async () => {
      const updated = { id: 'doc-1', status: 'processing' };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.markProcessing('doc-1');
      expect(result).toEqual(updated);
    });

    it('returns null when no row matched', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.markProcessing('missing');
      expect(result).toBeNull();
    });
  });

  describe('bulkMarkDeleted', () => {
    it('does nothing for empty array', async () => {
      await repo.bulkMarkDeleted([]);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('calls update for non-empty array', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.bulkMarkDeleted(['doc-1', 'doc-2']);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('bulkUpdate', () => {
    it('does nothing for empty array', async () => {
      await repo.bulkUpdate([], { status: 'ready' });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('calls update for non-empty array', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.bulkUpdate(['doc-1'], { status: 'ready' });
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('findByIds', () => {
    it('returns empty array for empty input', async () => {
      const result = await repo.findByIds([]);
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('calls select for non-empty input', async () => {
      const docs = [{ id: 'doc-1' }];
      db._chain.where = vi.fn().mockResolvedValue(docs);

      const result = await repo.findByIds(['doc-1']);
      expect(result).toEqual(docs);
    });
  });

  describe('listIdsBySyncTargetId', () => {
    it('returns id-only rows', async () => {
      const rows = [{ id: 'doc-1' }, { id: 'doc-2' }];
      db._chain.where = vi.fn().mockResolvedValue(rows);

      const result = await repo.listIdsBySyncTargetId('st-1');
      expect(result).toEqual(rows);
    });
  });

  describe('listNonDeletedBySyncTargetId', () => {
    it('returns non-deleted rows', async () => {
      const rows = [{ id: 'doc-1', sourceKey: 'key-1' }];
      db._chain.where = vi.fn().mockResolvedValue(rows);

      const result = await repo.listNonDeletedBySyncTargetId('st-1');
      expect(result).toEqual(rows);
    });
  });

  describe('listBySourceKeyPrefix', () => {
    it('returns matching documents', async () => {
      const rows = [{ id: 'doc-1', sourceKey: 'prefix/file.txt' }];
      db._chain.where = vi.fn().mockResolvedValue(rows);

      const result = await repo.listBySourceKeyPrefix('st-1', 'prefix/');
      expect(result).toEqual(rows);
    });
  });

  describe('findBySyncTargetAndSourceKeys', () => {
    it('returns empty array for empty sourceKeys', async () => {
      const result = await repo.findBySyncTargetAndSourceKeys('st-1', []);
      expect(result).toEqual([]);
    });

    it('returns matching documents', async () => {
      const rows = [{ id: 'doc-1' }];
      db._chain.where = vi.fn().mockResolvedValue(rows);

      const result = await repo.findBySyncTargetAndSourceKeys('st-1', ['key1']);
      expect(result).toEqual(rows);
    });
  });

  describe('upsertBySourceKey', () => {
    it('returns the upserted row', async () => {
      const row = { id: 'doc-1', sourceKey: 'key' };
      db._chain.returning = vi.fn().mockResolvedValue([row]);

      const result = await repo.upsertBySourceKey({ sourceKey: 'key', syncTargetId: 'st-1' } as never);
      expect(result).toEqual(row);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('updateSourceKey', () => {
    it('returns updated row', async () => {
      const row = { id: 'doc-1', sourceKey: 'new-key' };
      db._chain.returning = vi.fn().mockResolvedValue([row]);

      const result = await repo.updateSourceKey('st-1', 'old-key', 'new-key');
      expect(result).toEqual(row);
    });

    it('returns null when no match', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.updateSourceKey('st-1', 'old', 'new');
      expect(result).toBeNull();
    });
  });

  describe('metadataFields', () => {
    it('returns mapped metadata fields', async () => {
      const rawRows = [{ key: 'region', values: ['US', 'EU'], count: 5 }];
      db.execute = vi.fn().mockResolvedValue(rawRows);

      const result = await repo.metadataFields('st-1');
      expect(result).toEqual([{ key: 'region', values: ['US', 'EU'], count: 5 }]);
      expect(db.execute).toHaveBeenCalled();
    });

    it('handles null values array', async () => {
      const rawRows = [{ key: 'tag', values: null, count: 1 }];
      db.execute = vi.fn().mockResolvedValue(rawRows);

      const result = await repo.metadataFields();
      expect(result).toEqual([{ key: 'tag', values: [], count: 1 }]);
    });
  });
});
