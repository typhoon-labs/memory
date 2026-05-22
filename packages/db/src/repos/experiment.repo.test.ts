import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExperimentRepo } from './experiment.repo';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe('ExperimentRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: ExperimentRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new ExperimentRepo(db as any);
  });

  describe('findById', () => {
    it('returns experiment when found', async () => {
      const row = { id: 'exp-1', status: 'running', dataset_id: 'ds-1', dataset_version: 1, total_items: 10 };
      db.execute.mockResolvedValueOnce([row]);

      const result = await repo.findById('exp-1');
      expect(result).toEqual(row);
      expect(db.execute).toHaveBeenCalled();
    });

    it('returns null when not found', async () => {
      db.execute.mockResolvedValueOnce([]);

      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('incrementSucceeded', () => {
    it('executes update query', async () => {
      await repo.incrementSucceeded('exp-1');
      expect(db.execute).toHaveBeenCalled();
    });
  });

  describe('incrementFailed', () => {
    it('executes update query', async () => {
      await repo.incrementFailed('exp-1');
      expect(db.execute).toHaveBeenCalled();
    });
  });
});
