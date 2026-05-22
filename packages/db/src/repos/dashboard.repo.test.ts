import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardRepo, getBucketInterval, normalizeDateRange } from './dashboard.repo';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe('normalizeDateRange', () => {
  it('defaults to 30d for undefined', () => {
    expect(normalizeDateRange(undefined)).toBe('30d');
  });

  it('returns valid ranges as-is', () => {
    expect(normalizeDateRange('1d')).toBe('1d');
    expect(normalizeDateRange('3d')).toBe('3d');
    expect(normalizeDateRange('7d')).toBe('7d');
    expect(normalizeDateRange('30d')).toBe('30d');
    expect(normalizeDateRange('90d')).toBe('90d');
  });

  it('falls back to 30d for invalid ranges', () => {
    expect(normalizeDateRange('2d')).toBe('30d');
    expect(normalizeDateRange('invalid')).toBe('30d');
  });
});

describe('getBucketInterval', () => {
  it('returns correct intervals', () => {
    expect(getBucketInterval('1d')).toBe('15 minutes');
    expect(getBucketInterval('3d')).toBe('1 hour');
    expect(getBucketInterval('7d')).toBe('2 hours');
    expect(getBucketInterval('30d')).toBe('8 hours');
    expect(getBucketInterval('90d')).toBe('1 day');
  });
});

describe('DashboardRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: DashboardRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new DashboardRepo(db as any);
  });

  describe('queryBuckets', () => {
    it('calls db.execute with generate_series', async () => {
      db.execute.mockResolvedValue([{ date: '2025-01-01' }, { date: '2025-01-02' }]);

      const result = await repo.queryBuckets('2025-01-01', '2025-01-02', '1 day');
      expect(result).toEqual(['2025-01-01', '2025-01-02']);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getScoreSeries', () => {
    it('calls db.execute with score query', async () => {
      const rows = [{ date: '2025-01-01', scorer_id: 'faithfulness', avg_score: 0.9, count: 10, fail_count: 1 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getScoreSeries('2025-01-01', '2025-01-31', '8 hours');
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('includes scorer filter when scorerId provided', async () => {
      db.execute.mockResolvedValue([]);

      await repo.getScoreSeries('2025-01-01', '2025-01-31', '8 hours', 'faithfulness');
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWorstThreads', () => {
    it('calls db.execute with worst threads query', async () => {
      const rows = [{ thread_id: 't-1', title: 'Bad', response_avg: 0.2, retrieval_avg: 0.3, score_count: 5 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getWorstThreads('2025-01-01', '2025-01-31', 10);
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserQuality', () => {
    it('calls db.execute with user quality query', async () => {
      const rows = [{ resource_id: 'user-1', email: 'a@b.com', response_avg: 0.7, score_count: 20, thread_count: 5 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getUserQuality('2025-01-01', '2025-01-31', 10);
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLatencySeries', () => {
    it('calls db.execute with latency query', async () => {
      const rows = [{ date: '2025-01-01', p50: 100, p95: 500, p99: 1000, count: 50 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getLatencySeries('2025-01-01', '2025-01-31', '8 hours');
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCostSeries', () => {
    it('calls db.execute with cost query', async () => {
      const rows = [{ date: '2025-01-01', prompt_tokens: 1000, completion_tokens: 500, call_count: 10 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getCostSeries('2025-01-01', '2025-01-31', '8 hours');
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });
});
