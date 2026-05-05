import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { managePartitions } from './partition-management';

/** Create a mock SQL client with tagged-template and .unsafe() support. */
function createMockSql() {
  const unsafeFn = vi.fn<(query: string) => Promise<unknown[]>>().mockResolvedValue([]);
  const taggedFn = vi.fn().mockResolvedValue([]);
  const sql = Object.assign(taggedFn, { unsafe: unsafeFn });
  return sql;
}

describe('managePartitions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T02:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('creating partitions', () => {
    it('creates partitions for daysAhead+1 days (0..daysAhead)', async () => {
      const sql = createMockSql();
      // No existing partitions
      sql.mockResolvedValue([]);

      const result = await managePartitions(sql, { retentionDays: 0, daysAhead: 2 });

      // Should create today + 2 more days = 3 partitions
      expect(result.created).toHaveLength(3);
      expect(result.created).toContain('ai_spans_2026_05_05');
      expect(result.created).toContain('ai_spans_2026_05_06');
      expect(result.created).toContain('ai_spans_2026_05_07');
    });

    it('defaults daysAhead to 7', async () => {
      const sql = createMockSql();
      sql.mockResolvedValue([]);

      const result = await managePartitions(sql, { retentionDays: 0 });

      // 0..7 = 8 partitions
      expect(result.created).toHaveLength(8);
    });

    it('skips creation when partition already exists', async () => {
      const sql = createMockSql();
      // Return a row indicating the partition exists
      sql.mockResolvedValue([{ '?column?': 1 }]);

      const result = await managePartitions(sql, { retentionDays: 0, daysAhead: 1 });

      expect(result.created).toHaveLength(0);
      expect(sql.unsafe).not.toHaveBeenCalled();
    });

    it('handles concurrent creation errors gracefully', async () => {
      const sql = createMockSql();
      sql.mockResolvedValue([]);
      sql.unsafe.mockRejectedValue(new Error('relation already exists'));

      const result = await managePartitions(sql, { retentionDays: 0, daysAhead: 0 });

      // Error is caught — partition not added to created list
      expect(result.created).toHaveLength(0);
    });
  });

  describe('dropping partitions', () => {
    it('drops partitions older than retentionDays', async () => {
      const sql = createMockSql();
      // First calls: partition existence checks (no existing for creation)
      sql.mockResolvedValue([]);
      // Override: after creation loop, the partitions query returns old partitions
      sql
        .mockResolvedValueOnce([]) // partition check for today
        .mockResolvedValueOnce([{ partition_name: 'ai_spans_2026_04_01' }, { partition_name: 'ai_spans_2026_05_04' }]);

      const result = await managePartitions(sql, { retentionDays: 1, daysAhead: 0 });

      // Cutoff is 2026-05-04, so ai_spans_2026_04_01 < cutoff => dropped
      // ai_spans_2026_05_04 = cutoff => NOT dropped (not strictly less than)
      expect(result.dropped).toContain('ai_spans_2026_04_01');
      expect(result.dropped).not.toContain('ai_spans_2026_05_04');
    });

    it('does not drop partitions within retention window', async () => {
      const sql = createMockSql();
      sql.mockResolvedValue([]);
      // Return only recent partitions
      sql
        .mockResolvedValueOnce([]) // partition check for today
        .mockResolvedValueOnce([{ partition_name: 'ai_spans_2026_05_05' }]);

      const result = await managePartitions(sql, { retentionDays: 30, daysAhead: 0 });

      expect(result.dropped).toHaveLength(0);
    });

    it('skips dropping when retentionDays is 0', async () => {
      const sql = createMockSql();
      sql.mockResolvedValue([]);

      const result = await managePartitions(sql, { retentionDays: 0, daysAhead: 0 });

      expect(result.dropped).toHaveLength(0);
    });
  });

  it('returns created and dropped partition names', async () => {
    const sql = createMockSql();
    sql.mockResolvedValue([]);

    const result = await managePartitions(sql, { retentionDays: 0, daysAhead: 0 });

    expect(result).toHaveProperty('created');
    expect(result).toHaveProperty('dropped');
    expect(Array.isArray(result.created)).toBe(true);
    expect(Array.isArray(result.dropped)).toBe(true);
  });
});
