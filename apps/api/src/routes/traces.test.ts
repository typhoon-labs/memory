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
import { traceRoutes } from './traces';

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

function makeTraceRow(overrides: Record<string, unknown> = {}) {
  return {
    trace_id: 'trace-1',
    started_at: '2026-04-20T10:00:00.000Z',
    ended_at: '2026-04-20T10:00:02.500Z',
    span_count: 5,
    duration_ms: 2500,
    has_error: false,
    all_completed: true,
    root_span_name: 'agent-run',
    root_span_type: 'agent_run',
    root_entity_type: 'agent',
    root_entity_name: 'typhoon-supervisor',
    thread_id: 'thread-1',
    service_name: 'typhoon-api',
    status: 'success',
    ...overrides,
  };
}

function makeSpanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'span-uuid-1',
    span_id: 'span-1',
    parent_span_id: null,
    name: 'agent-run',
    span_type: 'agent_run',
    started_at: '2026-04-20T10:00:00.000Z',
    ended_at: '2026-04-20T10:00:02.500Z',
    attributes: { 'gen_ai.usage.prompt_tokens': 100, 'gen_ai.usage.completion_tokens': 50 },
    input: { content: 'Hello' },
    output: { content: 'Hi there' },
    error: null,
    entity_type: 'agent',
    entity_name: 'typhoon-supervisor',
    thread_id: 'thread-1',
    service_name: 'typhoon-api',
    ...overrides,
  };
}

// ---------- Tests ----------
describe('Trace Routes', () => {
  let app: Hono;

  beforeEach(() => {
    mockSqlUnsafe.mockReset().mockResolvedValue([]);
    (dashboardCache as unknown as { _clear: () => void })._clear();
    app = mountRoutes(traceRoutes as unknown as Record<string, unknown>[]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('route structure', () => {
    it('has 2 routes, all using requireAuth and requireAdmin', () => {
      expect(traceRoutes).toHaveLength(2);
      for (const route of traceRoutes as unknown as Record<string, unknown>[]) {
        const mid = route.middleware as Array<{ name: string }>;
        expect(mid).toHaveLength(2);
      }
    });
  });

  describe('GET /v1/admin/traces', () => {
    it('returns trace list with correct shape', async () => {
      const row = makeTraceRow();
      // First call: data query, second call: count query
      mockSqlUnsafe.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ count: 1 }]);

      const res = await app.request('/v1/admin/traces?dateFrom=2026-04-01&dateTo=2026-04-22');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.traces).toHaveLength(1);
      expect(body.traces[0]).toEqual({
        traceId: 'trace-1',
        rootSpanName: 'agent-run',
        rootSpanType: 'agent_run',
        rootEntityType: 'agent',
        rootEntityName: 'typhoon-supervisor',
        threadId: 'thread-1',
        serviceName: 'typhoon-api',
        status: 'success',
        spanCount: 5,
        durationMs: 2500,
        startedAt: '2026-04-20T10:00:00.000Z',
        endedAt: '2026-04-20T10:00:02.500Z',
      });
      expect(body.total).toBe(1);
      expect(body.page).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('returns empty list when no traces', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      const res = await app.request('/v1/admin/traces');
      const body = await res.json();
      expect(body.traces).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('applies status filter', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await app.request('/v1/admin/traces?status=error');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain("'error'");
      expect(query).toContain('has_error');
    });

    it('applies entityType filter', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await app.request('/v1/admin/traces?entityType=agent');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain('root_entity_type = $');
    });

    it('applies threadId filter', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await app.request('/v1/admin/traces?threadId=thread-123');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain('"thread_id" = $');
      const params = mockSqlUnsafe.mock.calls[0][1] as string[];
      expect(params).toContain('thread-123');
    });

    it('applies search filter with ILIKE', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      await app.request('/v1/admin/traces?search=supervisor');

      const query = mockSqlUnsafe.mock.calls[0][0] as string;
      expect(query).toContain('root_span_name ILIKE $');
      const params = mockSqlUnsafe.mock.calls[0][1] as string[];
      expect(params).toContain('%supervisor%');
    });

    it('paginates correctly', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 100 }]);

      const res = await app.request('/v1/admin/traces?page=2&perPage=10');
      const body = await res.json();
      expect(body.page).toBe(2);
      expect(body.perPage).toBe(10);
      expect(body.hasMore).toBe(true);
    });

    it('caches results on second call', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([makeTraceRow()]).mockResolvedValueOnce([{ count: 1 }]);

      const res1 = await app.request('/v1/admin/traces?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body1 = await res1.json();

      const res2 = await app.request('/v1/admin/traces?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body2 = await res2.json();

      // Should only hit SQL twice (data + count) for the first request
      expect(mockSqlUnsafe).toHaveBeenCalledTimes(2);
      expect(body1).toEqual(body2);
    });
  });

  describe('GET /v1/admin/traces/:traceId', () => {
    it('returns full span tree with summary', async () => {
      const rootSpan = makeSpanRow();
      const childSpan = makeSpanRow({
        id: 'span-uuid-2',
        span_id: 'span-2',
        parent_span_id: 'span-1',
        name: 'model-call',
        span_type: 'model_generation',
        started_at: '2026-04-20T10:00:00.500Z',
        ended_at: '2026-04-20T10:00:02.000Z',
      });
      mockSqlUnsafe.mockResolvedValueOnce([rootSpan, childSpan]);

      const res = await app.request('/v1/admin/traces/trace-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.traceId).toBe('trace-1');
      expect(body.spans).toHaveLength(2);
      expect(body.spans[0].spanId).toBe('span-1');
      expect(body.spans[0].promptTokens).toBe(100);
      expect(body.spans[0].completionTokens).toBe(50);
      expect(body.spans[1].spanId).toBe('span-2');
      expect(body.summary.status).toBe('success');
      expect(body.summary.spanCount).toBe(2);
      expect(body.summary.rootSpanName).toBe('agent-run');
      expect(body.summary.durationMs).toBe(2500);
    });

    it('returns error status when any span has error', async () => {
      const span = makeSpanRow({ error: { message: 'Something failed' } });
      mockSqlUnsafe.mockResolvedValueOnce([span]);

      const res = await app.request('/v1/admin/traces/trace-1');
      const body = await res.json();
      expect(body.summary.status).toBe('error');
    });

    it('returns partial status when spans are incomplete', async () => {
      const span = makeSpanRow({ ended_at: null });
      mockSqlUnsafe.mockResolvedValueOnce([span]);

      const res = await app.request('/v1/admin/traces/trace-1');
      const body = await res.json();
      expect(body.summary.status).toBe('partial');
      expect(body.summary.durationMs).toBeNull();
    });

    it('returns 404 when trace not found', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/traces/nonexistent');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Trace not found');
    });

    it('extracts token counts from attributes', async () => {
      const span = makeSpanRow({
        attributes: {
          'gen_ai.usage.prompt_tokens': 200,
          'gen_ai.usage.completion_tokens': 100,
        },
      });
      mockSqlUnsafe.mockResolvedValueOnce([span]);

      const res = await app.request('/v1/admin/traces/trace-1');
      const body = await res.json();
      expect(body.spans[0].promptTokens).toBe(200);
      expect(body.spans[0].completionTokens).toBe(100);
    });

    it('handles null attributes gracefully', async () => {
      const span = makeSpanRow({ attributes: null });
      mockSqlUnsafe.mockResolvedValueOnce([span]);

      const res = await app.request('/v1/admin/traces/trace-1');
      const body = await res.json();
      expect(body.spans[0].promptTokens).toBeNull();
      expect(body.spans[0].completionTokens).toBeNull();
    });
  });
});
