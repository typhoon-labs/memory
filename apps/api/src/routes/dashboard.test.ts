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
    it('returns score series from raw SQL', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([
        { date: '2026-04-20', scorer_id: 'faithfulness', avg_score: 0.85, count: 10, fail_count: 1 },
        { date: '2026-04-20', scorer_id: 'hallucination', avg_score: 0.15, count: 10, fail_count: 8 },
      ]);

      const res = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(2);
      expect(body.series[0]).toEqual({
        date: '2026-04-20',
        scorerId: 'faithfulness',
        avgScore: 0.85,
        count: 10,
        failCount: 1,
      });
    });

    it('filters by scorerId when provided', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);
      await app.request('/v1/admin/dashboard/scores?scorerId=hallucination');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain('"scorer_id" = $3');
    });

    it('returns empty series when no data', async () => {
      const res = await app.request('/v1/admin/dashboard/scores');
      const body = await res.json();
      expect(body.series).toEqual([]);
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
          avg_score: 0.3,
          min_score: 0.1,
          score_count: 5,
        },
      ]);

      const res = await app.request('/v1/admin/dashboard/threads?limit=5');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].threadId).toBe('t-1');
      expect(body.threads[0].avgScore).toBe(0.3);
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
        { resource_id: 'user-1', avg_score: 0.6, min_score: 0.2, score_count: 20, thread_count: 3 },
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
    it('returns latency percentiles', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([{ date: '2026-04-20', p50: 1234.5, p95: 3456.7, p99: 5678.9, count: 50 }]);

      const res = await app.request('/v1/admin/dashboard/latency');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(1);
      expect(body.series[0].p50).toBe(1235); // rounded
      expect(body.series[0].p95).toBe(3457);
      expect(body.series[0].count).toBe(50);
    });

    it('queries ai_spans for agent spans', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);
      await app.request('/v1/admin/dashboard/latency');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain('"ai_spans"');
      expect(query).toContain("'agent'");
    });
  });

  describe('GET /v1/admin/dashboard/cost', () => {
    it('returns token usage data', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([
        { date: '2026-04-20', prompt_tokens: 5000, completion_tokens: 2000, call_count: 15 },
      ]);

      const res = await app.request('/v1/admin/dashboard/cost');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series).toHaveLength(1);
      expect(body.series[0].promptTokens).toBe(5000);
      expect(body.series[0].completionTokens).toBe(2000);
      expect(body.series[0].callCount).toBe(15);
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
      mockSqlUnsafe.mockResolvedValueOnce([
        { date: '2026-04-20', scorer_id: 'faithfulness', avg_score: 0.85, count: 10, fail_count: 1 },
      ]);

      const res1 = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body1 = await res1.json();

      // Second call should use cache — mockSqlUnsafe not called again
      const res2 = await app.request('/v1/admin/dashboard/scores?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body2 = await res2.json();

      expect(mockSqlUnsafe).toHaveBeenCalledTimes(1);
      expect(body1).toEqual(body2);
    });
  });
});
