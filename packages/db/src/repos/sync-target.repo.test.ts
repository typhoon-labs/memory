import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncTargetRepo } from './sync-target.repo';

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
    _chain: chain,
  };

  return db;
}

describe('SyncTargetRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: SyncTargetRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new SyncTargetRepo(db as any);
  });

  describe('findById', () => {
    it('returns target when found', async () => {
      const target = { id: 'st-1', name: 'Test' };
      db._chain.where = vi.fn().mockResolvedValue([target]);

      const result = await repo.findById('st-1');
      expect(result).toEqual(target);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('returns empty array for empty input', async () => {
      const result = await repo.findByIds([]);
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns matching targets', async () => {
      const targets = [{ id: 'st-1' }, { id: 'st-2' }];
      db._chain.where = vi.fn().mockResolvedValue(targets);

      const result = await repo.findByIds(['st-1', 'st-2']);
      expect(result).toEqual(targets);
    });
  });

  describe('listAll', () => {
    it('returns all sync targets', async () => {
      const targets = [{ id: 'st-1' }];
      db._chain.from = vi.fn().mockResolvedValue(targets);

      const result = await repo.listAll();
      expect(result).toEqual(targets);
    });
  });

  describe('listActive', () => {
    it('returns active sync targets', async () => {
      const targets = [{ id: 'st-1', isActive: true }];
      db._chain.where = vi.fn().mockResolvedValue(targets);

      const result = await repo.listActive();
      expect(result).toEqual(targets);
    });
  });

  describe('create', () => {
    it('returns created sync target', async () => {
      const created = { id: 'st-1', name: 'New' };
      db._chain.returning = vi.fn().mockResolvedValue([created]);

      const result = await repo.create({ name: 'New' } as never);
      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('returns updated sync target', async () => {
      const updated = { id: 'st-1', name: 'Updated' };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.update('st-1', { name: 'Updated' } as never);
      expect(result).toEqual(updated);
    });

    it('returns null when no match', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.update('missing', { name: 'x' } as never);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('calls delete', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.delete('st-1');
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('countByMetadataTemplateId', () => {
    it('returns count of matching sync targets', async () => {
      db._chain.where = vi.fn().mockResolvedValue([{ id: 'st-1' }, { id: 'st-2' }]);

      const result = await repo.countByMetadataTemplateId('tmpl-1');
      expect(result).toBe(2);
    });

    it('returns 0 when none match', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.countByMetadataTemplateId('tmpl-none');
      expect(result).toBe(0);
    });
  });
});
