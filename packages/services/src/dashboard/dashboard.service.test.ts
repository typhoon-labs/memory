import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOk } from '../test-helpers';
import type { DashboardServiceDeps } from './dashboard.service';
import { DashboardService } from './dashboard.service';

vi.mock('@typhoon/db/repos', () => ({
  normalizeDateRange: vi.fn((raw: string | undefined) => raw ?? '30d'),
  getBucketInterval: vi.fn((range: string) => {
    const map: Record<string, string> = { '7d': '1 day', '30d': '1 day', '90d': '1 week' };
    return map[range] ?? '1 day';
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<DashboardServiceDeps> = {}): DashboardServiceDeps {
  return {
    dashboardRepo: {
      queryBuckets: vi.fn().mockResolvedValue(['2026-01-01', '2026-01-02', '2026-01-03']),
      getScoreSeries: vi.fn().mockResolvedValue([]),
      getWorstThreads: vi.fn().mockResolvedValue([]),
      getUserQuality: vi.fn().mockResolvedValue([]),
      getLatencySeries: vi.fn().mockResolvedValue([]),
      getCostSeries: vi.fn().mockResolvedValue([]),
    } as unknown as DashboardServiceDeps['dashboardRepo'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('DashboardService', () => {
  let deps: DashboardServiceDeps;
  let service: DashboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new DashboardService(deps);
  });

  describe('getScoreSeries', () => {
    it('returns mapped score series with buckets', async () => {
      vi.mocked(deps.dashboardRepo.getScoreSeries).mockResolvedValueOnce([
        { date: '2026-01-01', scorer_id: 's-1', avg_score: 0.85, count: 10, fail_count: 1 },
      ] as never);

      const result = await service.getScoreSeries({ dateFrom: '2026-01-01', dateTo: '2026-01-03' });
      const data = assertOk(result);
      expect(data.series).toHaveLength(1);
      expect(data.series[0]).toEqual({
        date: '2026-01-01',
        scorerId: 's-1',
        avgScore: 0.85,
        count: 10,
        failCount: 1,
      });
      expect(data.buckets).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    });

    it('passes scorerId filter to repo', async () => {
      vi.mocked(deps.dashboardRepo.getScoreSeries).mockResolvedValueOnce([] as never);
      await service.getScoreSeries({ dateFrom: '2026-01-01', dateTo: '2026-01-03', scorerId: 's-1' });
      expect(deps.dashboardRepo.getScoreSeries).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-03',
        expect.any(String),
        's-1',
      );
    });
  });

  describe('getWorstThreads', () => {
    it('returns mapped worst threads', async () => {
      vi.mocked(deps.dashboardRepo.getWorstThreads).mockResolvedValueOnce([
        {
          thread_id: 't-1',
          title: 'Bad Thread',
          resource_id: 'user-1',
          response_avg: 0.3,
          retrieval_avg: 0.2,
          score_count: 5,
          thread_created_at: '2026-01-01',
        },
      ] as never);

      const result = await service.getWorstThreads({ dateFrom: '2026-01-01', dateTo: '2026-01-03', limit: 10 });
      const data = assertOk(result);
      expect(data.threads).toHaveLength(1);
      expect(data.threads[0]).toEqual({
        threadId: 't-1',
        title: 'Bad Thread',
        resourceId: 'user-1',
        responseAvg: 0.3,
        retrievalAvg: 0.2,
        scoreCount: 5,
        createdAt: '2026-01-01',
      });
    });

    it('returns empty array when no threads', async () => {
      vi.mocked(deps.dashboardRepo.getWorstThreads).mockResolvedValueOnce([] as never);
      const result = await service.getWorstThreads({ dateFrom: '2026-01-01', dateTo: '2026-01-03', limit: 10 });
      const data = assertOk(result);
      expect(data.threads).toHaveLength(0);
    });
  });

  describe('getUserQuality', () => {
    it('returns mapped user quality data', async () => {
      vi.mocked(deps.dashboardRepo.getUserQuality).mockResolvedValueOnce([
        {
          resource_id: 'user-1',
          email: 'user@test.com',
          response_avg: 0.75,
          retrieval_avg: 0.8,
          score_count: 20,
          thread_count: 5,
        },
      ] as never);

      const result = await service.getUserQuality({ dateFrom: '2026-01-01', dateTo: '2026-01-03', limit: 10 });
      const data = assertOk(result);
      expect(data.users).toHaveLength(1);
      expect(data.users[0]).toEqual({
        resourceId: 'user-1',
        email: 'user@test.com',
        responseAvg: 0.75,
        retrievalAvg: 0.8,
        scoreCount: 20,
        threadCount: 5,
      });
    });
  });

  describe('getLatencySeries', () => {
    it('returns latency data with missing buckets filled with nulls', async () => {
      vi.mocked(deps.dashboardRepo.queryBuckets).mockResolvedValueOnce([
        '2026-01-01',
        '2026-01-02',
        '2026-01-03',
      ] as never);
      vi.mocked(deps.dashboardRepo.getLatencySeries).mockResolvedValueOnce([
        { date: '2026-01-01', p50: 120.5, p95: 350.2, p99: 500.9, count: 100 },
      ] as never);

      const result = await service.getLatencySeries({ dateFrom: '2026-01-01', dateTo: '2026-01-03' });
      const data = assertOk(result);
      expect(data.series).toHaveLength(3);
      // First bucket has data (with rounded values)
      expect(data.series[0]).toEqual({ date: '2026-01-01', p50: 121, p95: 350, p99: 501, count: 100 });
      // Second bucket is empty
      expect(data.series[1]).toEqual({ date: '2026-01-02', p50: null, p95: null, p99: null, count: 0 });
      // Third bucket is empty
      expect(data.series[2]).toEqual({ date: '2026-01-03', p50: null, p95: null, p99: null, count: 0 });
    });
  });

  describe('getCostSeries', () => {
    it('returns cost data with missing buckets filled with zeros', async () => {
      vi.mocked(deps.dashboardRepo.queryBuckets).mockResolvedValueOnce(['2026-01-01', '2026-01-02'] as never);
      vi.mocked(deps.dashboardRepo.getCostSeries).mockResolvedValueOnce([
        { date: '2026-01-01', prompt_tokens: 5000, completion_tokens: 3000, call_count: 50 },
      ] as never);

      const result = await service.getCostSeries({ dateFrom: '2026-01-01', dateTo: '2026-01-02' });
      const data = assertOk(result);
      expect(data.series).toHaveLength(2);
      expect(data.series[0]).toEqual({
        date: '2026-01-01',
        promptTokens: 5000,
        completionTokens: 3000,
        callCount: 50,
      });
      expect(data.series[1]).toEqual({
        date: '2026-01-02',
        promptTokens: 0,
        completionTokens: 0,
        callCount: 0,
      });
    });
  });
});
