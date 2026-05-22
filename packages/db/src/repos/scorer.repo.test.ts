import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScorerRepo } from './scorer.repo';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe('ScorerRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: ScorerRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new ScorerRepo(db as any);
  });

  describe('listWithLatestVersion', () => {
    it('returns rows from the join query', async () => {
      const row = { id: 'def-1', name: 'Test', status: 'active' };
      db.execute.mockResolvedValueOnce([row]);

      const result = await repo.listWithLatestVersion(0, 10);
      expect(result).toEqual([row]);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('includes status filter when valid status is provided', async () => {
      db.execute.mockResolvedValueOnce([]);
      await repo.listWithLatestVersion(0, 10, 'active');
      expect(db.execute).toHaveBeenCalled();
    });

    it('ignores invalid status values', async () => {
      db.execute.mockResolvedValueOnce([]);
      await repo.listWithLatestVersion(0, 10, 'invalid');
      expect(db.execute).toHaveBeenCalled();
    });
  });

  describe('countByStatus', () => {
    it('returns count without status filter', async () => {
      db.execute.mockResolvedValueOnce([{ count: 42 }]);
      const result = await repo.countByStatus();
      expect(result).toBe(42);
    });

    it('returns count with status filter', async () => {
      db.execute.mockResolvedValueOnce([{ count: 5 }]);
      const result = await repo.countByStatus('draft');
      expect(result).toBe(5);
    });

    it('returns 0 when no rows', async () => {
      db.execute.mockResolvedValueOnce([]);
      const result = await repo.countByStatus();
      expect(result).toBe(0);
    });
  });

  describe('findByIdWithVersion', () => {
    it('returns row when found', async () => {
      const row = { id: 'def-1', name: 'Scorer', type: 'llm' };
      db.execute.mockResolvedValueOnce([row]);

      const result = await repo.findByIdWithVersion('def-1');
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      db.execute.mockResolvedValueOnce([]);
      const result = await repo.findByIdWithVersion('nonexistent');
      expect(result).toBeNull();
    });
  });
});
