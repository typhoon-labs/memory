import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PartitionRepo } from './partition.repo';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe('PartitionRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: PartitionRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new PartitionRepo(db as any);
  });

  describe('exists', () => {
    it('returns true when partition exists', async () => {
      db.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
      const result = await repo.exists('ai_spans_2025_01_01');
      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalled();
    });

    it('returns false when partition does not exist', async () => {
      db.execute.mockResolvedValueOnce([]);
      const result = await repo.exists('ai_spans_2099_01_01');
      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('executes CREATE TABLE PARTITION DDL', async () => {
      await repo.create('ai_spans_2025_01_15', 'ai_spans', '2025-01-15', '2025-01-16');
      expect(db.execute).toHaveBeenCalled();
    });
  });

  describe('listPartitions', () => {
    it('returns partition names from pg_inherits', async () => {
      db.execute.mockResolvedValueOnce([
        { partition_name: 'ai_spans_2025_01_01' },
        { partition_name: 'ai_spans_2025_01_02' },
      ]);
      const result = await repo.listPartitions('ai_spans');
      expect(result).toEqual(['ai_spans_2025_01_01', 'ai_spans_2025_01_02']);
    });

    it('returns empty array when no partitions exist', async () => {
      db.execute.mockResolvedValueOnce([]);
      const result = await repo.listPartitions('ai_spans');
      expect(result).toEqual([]);
    });
  });

  describe('drop', () => {
    it('executes DROP TABLE DDL', async () => {
      await repo.drop('ai_spans_2024_10_01');
      expect(db.execute).toHaveBeenCalled();
    });
  });
});
