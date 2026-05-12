import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockSqlUnsafe } = vi.hoisted(() => ({
  mockSqlUnsafe: vi.fn().mockResolvedValue([]),
}));

// ---------- Module mocks ----------
vi.mock('../db', () => ({
  db: {},
  sql: { unsafe: mockSqlUnsafe },
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
    // biome-ignore lint/suspicious/noExplicitAny: dynamic route mounting for tests
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

// ---------- Tests ----------
describe('Dashboard Routes', () => {
  let app: Hono;

  beforeEach(() => {
    mockSqlUnsafe.mockReset().mockResolvedValue([]);
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
      mockSqlUnsafe
        .mockResolvedValueOnce([{ date: '2026-04-20 00:00:00+00' }]) // queryBuckets
        .mockResolvedValueOnce([
          { date: '2026-04-20 00:00:00+00', scorer_id: 'faithfulness', avg_score: 0.85, count: 10, fail_count: 1 },
          { date: '2026-04-20 00:00:00+00', scorer_id: 'hallucination', avg_score: 0.15, count: 10, fail_count: 8 },
        ]);

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

    it('filters by scorerId when provided', async () => {
      await app.request('/v1/admin/dashboard/scores?scorerId=hallucination');

      // call[0] = queryBuckets, call[1] = data query
      const query = mockSqlUnsafe.mock.calls[1][0] as string;
      expect(query).toContain('"scorer_id" = $3');
    });

    it('returns empty series and buckets when no data', async () => {
      const res = await app.request('/v1/admin/dashboard/scores');
      const body = await res.json();
      expect(body.series).toEqual([]);
      expect(body.buckets).toEqual([]);
    });

    it('uses date_bin with range-based bucket interval', async () => {
      await app.request('/v1/admin/dashboard/scores?range=1d');

      // call[1] = data query
      const query = mockSqlUnsafe.mock.calls[1][0] as string;
      expect(query).toContain("date_bin('15 minutes'");
    });

    it('defaults to 30d bucket when range is invalid', async () => {
      await app.request('/v1/admin/dashboard/scores?range=bogus');

      const query = mockSqlUnsafe.mock.calls[1][0] as string;
      expect(query).toContain("date_bin('8 hours'");
    });
  });

  describe('GET /v1/admin/dashboard/threads', () => {
    it('returns worst-scoring threads', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([
        {
          thread_id: 't-1',
          title: 'Bad Thread',
          resource_id: 'user-1',
          thread_created_at: '2026-04-15',
          response_avg: 0.3,
          retrieval_avg: 0.6,
          score_count: 5,
        },
      ]);

      const res = await app.request('/v1/admin/dashboard/threads?limit=5');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].threadId).toBe('t-1');
      expect(body.threads[0].responseAvg).toBe(0.3);
      expect(body.threads[0].retrievalAvg).toBe(0.6);
    });

    it('clamps limit to 50', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);
      await app.request('/v1/admin/dashboard/threads?limit=999');

      const params = mockSqlUnsafe.mock.calls[0][1];
      expect(params[2]).toBe(50);
    });
  });

  describe('GET /v1/admin/dashboard/users', () => {
    it('returns per-user quality data', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([
        { resource_id: 'user-1', response_avg: 0.6, retrieval_avg: 0.4, score_count: 20, thread_count: 3 },
      ]);

      const res = await app.request('/v1/admin/dashboard/users');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.users).toHaveLength(1);
      expect(body.users[0].resourceId).toBe('user-1');
      expect(body.users[0].threadCount).toBe(3);
    });

    it('excludes human-review scorer in SQL', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);
      await app.request('/v1/admin/dashboard/users');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain("!= 'human-review'");
    });
  });

  describe('GET /v1/admin/dashboard/latency', () => {
    it('returns latency percentiles with null-filled gaps', async () => {
      mockSqlUnsafe
        .mockResolvedValueOnce([{ date: '2026-04-19 00:00:00+00' }, { date: '2026-04-20 00:00:00+00' }]) // buckets
        .mockResolvedValueOnce([{ date: '2026-04-20 00:00:00+00', p50: 1234.5, p95: 3456.7, p99: 5678.9, count: 50 }]);

      const res = await app.request('/v1/admin/dashboard/latency');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(2);
      // First bucket has no data — null-filled
      expect(body.series[0]).toEqual({
        date: '2026-04-19 00:00:00+00',
        p50: null,
        p95: null,
        p99: null,
        count: 0,
      });
      // Second bucket has data
      expect(body.series[1].p50).toBe(1235); // rounded
      expect(body.series[1].p95).toBe(3457);
      expect(body.series[1].count).toBe(50);
    });

    it('queries ai_spans for agent spans', async () => {
      await app.request('/v1/admin/dashboard/latency');

      // call[1] = data query
      const query = mockSqlUnsafe.mock.calls[1][0] as string;
      expect(query).toContain('"ai_spans"');
      expect(query).toContain("'agent_run'");
    });

    it('uses date_bin with range-based bucket interval', async () => {
      await app.request('/v1/admin/dashboard/latency?range=7d');

      const query = mockSqlUnsafe.mock.calls[1][0] as string;
      expect(query).toContain("date_bin('2 hours'");
    });
  });

  describe('GET /v1/admin/dashboard/cost', () => {
    it('returns token usage with zero-filled gaps', async () => {
      mockSqlUnsafe
        .mockResolvedValueOnce([{ date: '2026-04-19 00:00:00+00' }, { date: '2026-04-20 00:00:00+00' }]) // buckets
        .mockResolvedValueOnce([
          { date: '2026-04-20 00:00:00+00', prompt_tokens: 5000, completion_tokens: 2000, call_count: 15 },
        ]);

      const res = await app.request('/v1/admin/dashboard/cost');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(2);
      // First bucket — zero-filled
      expect(body.series[0]).toEqual({
        date: '2026-04-19 00:00:00+00',
        promptTokens: 0,
        completionTokens: 0,
        callCount: 0,
      });
      // Second bucket — real data
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
      mockSqlUnsafe
        .mockResolvedValueOnce([{ date: '2026-04-20 00:00:00+00' }]) // queryBuckets
        .mockResolvedValueOnce([
          { date: '2026-04-20 00:00:00+00', scorer_id: 'faithfulness', avg_score: 0.85, count: 10, fail_count: 1 },
        ]);

      const res1 = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body1 = await res1.json();

      // Second call should use cache — mockSqlUnsafe not called again
      const res2 = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body2 = await res2.json();

      expect(mockSqlUnsafe).toHaveBeenCalledTimes(2); // 2 calls for the first (uncached) request
      expect(body1).toEqual(body2);
    });
  });
});
