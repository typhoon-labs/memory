import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScoreRepo } from './score.repo';

function createMockDb() {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };

  return {
    execute: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue(insertChain),
    _insertChain: insertChain,
  };
}

describe('ScoreRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: ScoreRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new ScoreRepo(db as any);
  });

  describe('hasExistingScore', () => {
    it('returns true when a score exists', async () => {
      db.execute.mockResolvedValue([{ '?column?': 1 }]);

      const result = await repo.hasExistingScore('entity-1', 'faithfulness');
      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('returns false when no score exists', async () => {
      db.execute.mockResolvedValue([]);

      const result = await repo.hasExistingScore('entity-1', 'faithfulness');
      expect(result).toBe(false);
    });
  });

  describe('saveScore', () => {
    it('inserts score using Drizzle insert builder', async () => {
      await repo.saveScore({
        id: 'score-1',
        entityId: 'ent-1',
        scorerId: 'faithfulness',
        score: 0.95,
      });

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db._insertChain.values).toHaveBeenCalledWith({
        id: 'score-1',
        entityId: 'ent-1',
        scorerId: 'faithfulness',
        score: 0.95,
      });
      expect(db._insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it('passes object values directly (Drizzle handles JSONB serialization)', async () => {
      await repo.saveScore({
        id: 'score-1',
        metadata: { key: 'value' },
      });

      expect(db._insertChain.values).toHaveBeenCalledWith({
        id: 'score-1',
        metadata: { key: 'value' },
      });
    });

    it('passes Date values directly', async () => {
      const now = new Date();

      await repo.saveScore({
        id: 'score-1',
        createdAt: now,
      });

      expect(db._insertChain.values).toHaveBeenCalledWith({
        id: 'score-1',
        createdAt: now,
      });
    });

    it('uses onConflictDoNothing for deduplication', async () => {
      await repo.saveScore({ id: 'score-1' });

      expect(db._insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
    });
  });
});
