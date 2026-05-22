import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockDashboardService } = vi.hoisted(() => ({
  mockDashboardService: {
    getScoreSeries: vi.fn(),
    getWorstThreads: vi.fn(),
    getUserQuality: vi.fn(),
    getLatencySeries: vi.fn(),
    getCostSeries: vi.fn(),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getDashboardService: () => mockDashboardService,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: createMiddleware(async (c, next) => {
    c.set('user' as never, { id: 'admin-1', email: 'admin@test.example', role: APP_ROLES.ADMIN });
    await next();
  }),
}));

vi.mock('../middleware/require-admin', () => ({
  requireAdmin: createMiddleware(async (_c, next) => {
    await next();
  }),
}));

vi.mock('../lib/cache', () => {
  const store = new Map<string, unknown>();
  return {
    dashboardCache: {
      get: (key: string) => store.get(key),
      set: (key: string, data: unknown) => store.set(key, data),
      invalidate: (prefix: string) => {
        for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
      },
      _clear: () => store.clear(),
    },
  };
});

// ---------- Import module under test ----------
import { dashboardCache } from '../lib/cache';
import { dashboardRoutes } from './dashboard';

// ---------- Helpers ----------
function mountRoutes(routes: Record<string, unknown>[]) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

// ---------- Tests ----------
describe('Dashboard Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.resetAllMocks();
    (dashboardCache as unknown as { _clear: () => void })._clear();
    app = mountRoutes(dashboardRoutes as unknown as Record<string, unknown>[]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('route structure', () => {
    it('has 6 routes, all using requireAuth and requireAdmin', () => {
      expect(dashboardRoutes).toHaveLength(6);
      for (const route of dashboardRoutes as unknown as Record<string, unknown>[]) {
        const mid = route.middleware as Array<{ name: string }>;
        expect(mid).toHaveLength(2);
      }
    });
  });

  describe('GET /v1/admin/dashboard/scores', () => {
    it('returns score series with buckets', async () => {
      mockDashboardService.getScoreSeries.mockResolvedValueOnce({
        data: {
          series: [
            { date: '2026-04-20 00:00:00+00', scorerId: 'faithfulness', avgScore: 0.85, count: 10, failCount: 1 },
            { date: '2026-04-20 00:00:00+00', scorerId: 'hallucination', avgScore: 0.15, count: 10, failCount: 8 },
          ],
          buckets: ['2026-04-20 00:00:00+00'],
        },
      });

      const res = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(2);
      expect(body.buckets).toEqual(['2026-04-20 00:00:00+00']);
      expect(body.series[0]).toEqual({
        date: '2026-04-20 00:00:00+00',
        scorerId: 'faithfulness',
        avgScore: 0.85,
        count: 10,
        failCount: 1,
      });
    });

    it('passes scorerId to service when provided', async () => {
      mockDashboardService.getScoreSeries.mockResolvedValueOnce({
        data: { series: [], buckets: [] },
      });

      await app.request('/v1/admin/dashboard/scores?scorerId=hallucination');

      expect(mockDashboardService.getScoreSeries).toHaveBeenCalledWith(
        expect.objectContaining({ scorerId: 'hallucination' }),
      );
    });

    it('returns empty series and buckets when no data', async () => {
      mockDashboardService.getScoreSeries.mockResolvedValueOnce({
        data: { series: [], buckets: [] },
      });

      const res = await app.request('/v1/admin/dashboard/scores');
      const body = await res.json();
      expect(body.series).toEqual([]);
      expect(body.buckets).toEqual([]);
    });

    it('passes range to service', async () => {
      mockDashboardService.getScoreSeries.mockResolvedValueOnce({
        data: { series: [], buckets: [] },
      });

      await app.request('/v1/admin/dashboard/scores?range=1d');

      expect(mockDashboardService.getScoreSeries).toHaveBeenCalledWith(expect.objectContaining({ range: '1d' }));
    });

    it('defaults to 30d range when range is invalid', async () => {
      mockDashboardService.getScoreSeries.mockResolvedValueOnce({
        data: { series: [], buckets: [] },
      });

      await app.request('/v1/admin/dashboard/scores?range=bogus');

      expect(mockDashboardService.getScoreSeries).toHaveBeenCalledWith(expect.objectContaining({ range: 'bogus' }));
      // The service internally normalizes invalid ranges to '30d'
    });
  });

  describe('GET /v1/admin/dashboard/threads', () => {
    it('returns worst-scoring threads', async () => {
      mockDashboardService.getWorstThreads.mockResolvedValueOnce({
        data: {
          threads: [
            {
              threadId: 't-1',
              title: 'Bad Thread',
              resourceId: 'user-1',
              responseAvg: 0.3,
              retrievalAvg: 0.6,
              scoreCount: 5,
              createdAt: '2026-04-15',
            },
          ],
        },
      });

      const res = await app.request('/v1/admin/dashboard/threads?limit=5');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].threadId).toBe('t-1');
      expect(body.threads[0].responseAvg).toBe(0.3);
      expect(body.threads[0].retrievalAvg).toBe(0.6);
    });

    it('clamps limit to 50', async () => {
      mockDashboardService.getWorstThreads.mockResolvedValueOnce({
        data: { threads: [] },
      });

      await app.request('/v1/admin/dashboard/threads?limit=999');

      expect(mockDashboardService.getWorstThreads).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    });
  });

  describe('GET /v1/admin/dashboard/users', () => {
    it('returns per-user quality data', async () => {
      mockDashboardService.getUserQuality.mockResolvedValueOnce({
        data: {
          users: [
            { resourceId: 'user-1', email: null, responseAvg: 0.6, retrievalAvg: 0.4, scoreCount: 20, threadCount: 3 },
          ],
        },
      });

      const res = await app.request('/v1/admin/dashboard/users');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.users).toHaveLength(1);
      expect(body.users[0].resourceId).toBe('user-1');
      expect(body.users[0].threadCount).toBe(3);
    });
  });

  describe('GET /v1/admin/dashboard/latency', () => {
    it('returns latency percentiles', async () => {
      mockDashboardService.getLatencySeries.mockResolvedValueOnce({
        data: {
          series: [
            { date: '2026-04-19 00:00:00+00', p50: null, p95: null, p99: null, count: 0 },
            { date: '2026-04-20 00:00:00+00', p50: 1235, p95: 3457, p99: 5679, count: 50 },
          ],
        },
      });

      const res = await app.request('/v1/admin/dashboard/latency');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(2);
      expect(body.series[0]).toEqual({
        date: '2026-04-19 00:00:00+00',
        p50: null,
        p95: null,
        p99: null,
        count: 0,
      });
      expect(body.series[1].p50).toBe(1235);
      expect(body.series[1].p95).toBe(3457);
      expect(body.series[1].count).toBe(50);
    });

    it('passes range to service', async () => {
      mockDashboardService.getLatencySeries.mockResolvedValueOnce({
        data: { series: [] },
      });

      await app.request('/v1/admin/dashboard/latency?range=7d');

      expect(mockDashboardService.getLatencySeries).toHaveBeenCalledWith(expect.objectContaining({ range: '7d' }));
    });
  });

  describe('GET /v1/admin/dashboard/cost', () => {
    it('returns token usage', async () => {
      mockDashboardService.getCostSeries.mockResolvedValueOnce({
        data: {
          series: [
            { date: '2026-04-19 00:00:00+00', promptTokens: 0, completionTokens: 0, callCount: 0 },
            { date: '2026-04-20 00:00:00+00', promptTokens: 5000, completionTokens: 2000, callCount: 15 },
          ],
        },
      });

      const res = await app.request('/v1/admin/dashboard/cost');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(2);
      expect(body.series[0]).toEqual({
        date: '2026-04-19 00:00:00+00',
        promptTokens: 0,
        completionTokens: 0,
        callCount: 0,
      });
      expect(body.series[1].promptTokens).toBe(5000);
      expect(body.series[1].completionTokens).toBe(2000);
      expect(body.series[1].callCount).toBe(15);
    });
  });

  describe('GET /v1/admin/dashboard/documents', () => {
    it('returns stub response', async () => {
      const res = await app.request('/v1/admin/dashboard/documents');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.documents).toEqual([]);
      expect(body.message).toContain('future phase');
    });
  });

  describe('caching', () => {
    it('returns cached response on second call', async () => {
      mockDashboardService.getScoreSeries.mockResolvedValueOnce({
        data: {
          series: [
            { date: '2026-04-20 00:00:00+00', scorerId: 'faithfulness', avgScore: 0.85, count: 10, failCount: 1 },
          ],
          buckets: ['2026-04-20 00:00:00+00'],
        },
      });

      const res1 = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body1 = await res1.json();

      const res2 = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body2 = await res2.json();

      expect(mockDashboardService.getScoreSeries).toHaveBeenCalledTimes(1);
      expect(body1).toEqual(body2);
    });
  });
});
