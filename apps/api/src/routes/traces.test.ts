import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockTraceService } = vi.hoisted(() => ({
  mockTraceService: {
    listTraces: vi.fn(),
    getDetail: vi.fn(),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getTraceService: () => mockTraceService,
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
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

// ---------- Tests ----------
describe('Trace Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.resetAllMocks();
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
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: {
          traces: [
            {
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
            },
          ],
          total: 1,
          page: 0,
          perPage: 50,
          hasMore: false,
        },
      });

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
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: { traces: [], total: 0, page: 0, perPage: 50, hasMore: false },
      });

      const res = await app.request('/v1/admin/traces');
      const body = await res.json();
      expect(body.traces).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('passes status filter to service', async () => {
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: { traces: [], total: 0, page: 0, perPage: 50, hasMore: false },
      });

      await app.request('/v1/admin/traces?status=error');

      expect(mockTraceService.listTraces).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    });

    it('passes entityType filter to service', async () => {
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: { traces: [], total: 0, page: 0, perPage: 50, hasMore: false },
      });

      await app.request('/v1/admin/traces?entityType=agent');

      expect(mockTraceService.listTraces).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'agent' }));
    });

    it('passes threadId filter to service', async () => {
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: { traces: [], total: 0, page: 0, perPage: 50, hasMore: false },
      });

      await app.request('/v1/admin/traces?threadId=thread-123');

      expect(mockTraceService.listTraces).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-123' }));
    });

    it('passes search filter to service', async () => {
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: { traces: [], total: 0, page: 0, perPage: 50, hasMore: false },
      });

      await app.request('/v1/admin/traces?search=supervisor');

      expect(mockTraceService.listTraces).toHaveBeenCalledWith(expect.objectContaining({ search: 'supervisor' }));
    });

    it('paginates correctly', async () => {
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: { traces: [], total: 100, page: 2, perPage: 10, hasMore: true },
      });

      const res = await app.request('/v1/admin/traces?page=2&perPage=10');
      const body = await res.json();
      expect(body.page).toBe(2);
      expect(body.perPage).toBe(10);
      expect(body.hasMore).toBe(true);
    });

    it('caches results on second call', async () => {
      mockTraceService.listTraces.mockResolvedValueOnce({
        data: {
          traces: [
            {
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
            },
          ],
          total: 1,
          page: 0,
          perPage: 50,
          hasMore: false,
        },
      });

      const res1 = await app.request('/v1/admin/traces?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body1 = await res1.json();

      const res2 = await app.request('/v1/admin/traces?dateFrom=2026-04-01&dateTo=2026-04-22');
      const body2 = await res2.json();

      expect(mockTraceService.listTraces).toHaveBeenCalledTimes(1);
      expect(body1).toEqual(body2);
    });
  });

  describe('GET /v1/admin/traces/:traceId', () => {
    it('returns full span tree with summary', async () => {
      mockTraceService.getDetail.mockResolvedValueOnce({
        data: {
          traceId: 'trace-1',
          spans: [
            {
              id: 'span-uuid-1',
              spanId: 'span-1',
              parentSpanId: null,
              name: 'agent-run',
              spanType: 'agent_run',
              startedAt: '2026-04-20T10:00:00.000Z',
              endedAt: '2026-04-20T10:00:02.500Z',
              durationMs: 2500,
              attributes: { 'gen_ai.usage.prompt_tokens': 100, 'gen_ai.usage.completion_tokens': 50 },
              input: { content: 'Hello' },
              output: { content: 'Hi there' },
              error: null,
              entityType: 'agent',
              entityName: 'typhoon-supervisor',
              threadId: 'thread-1',
              serviceName: 'typhoon-api',
              promptTokens: 100,
              completionTokens: 50,
            },
            {
              id: 'span-uuid-2',
              spanId: 'span-2',
              parentSpanId: 'span-1',
              name: 'model-call',
              spanType: 'model_generation',
              startedAt: '2026-04-20T10:00:00.500Z',
              endedAt: '2026-04-20T10:00:02.000Z',
              durationMs: 1500,
              attributes: { 'gen_ai.usage.prompt_tokens': 100, 'gen_ai.usage.completion_tokens': 50 },
              input: { content: 'Hello' },
              output: { content: 'Hi there' },
              error: null,
              entityType: 'agent',
              entityName: 'typhoon-supervisor',
              threadId: 'thread-1',
              serviceName: 'typhoon-api',
              promptTokens: 100,
              completionTokens: 50,
            },
          ],
          summary: {
            status: 'success',
            spanCount: 2,
            durationMs: 2500,
            rootSpanName: 'agent-run',
            threadId: 'thread-1',
            startedAt: '2026-04-20T10:00:00.000Z',
            endedAt: '2026-04-20T10:00:02.500Z',
          },
        },
      });

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

    it('returns error status when service returns error', async () => {
      mockTraceService.getDetail.mockResolvedValueOnce({
        data: {
          traceId: 'trace-1',
          spans: [
            {
              id: 'span-uuid-1',
              spanId: 'span-1',
              parentSpanId: null,
              name: 'agent-run',
              spanType: 'agent_run',
              startedAt: '2026-04-20T10:00:00.000Z',
              endedAt: '2026-04-20T10:00:02.500Z',
              durationMs: 2500,
              attributes: null,
              input: null,
              output: null,
              error: { message: 'Something failed' },
              entityType: 'agent',
              entityName: 'typhoon-supervisor',
              threadId: 'thread-1',
              serviceName: 'typhoon-api',
              promptTokens: null,
              completionTokens: null,
            },
          ],
          summary: {
            status: 'error',
            spanCount: 1,
            durationMs: 2500,
            rootSpanName: 'agent-run',
            threadId: 'thread-1',
            startedAt: '2026-04-20T10:00:00.000Z',
            endedAt: '2026-04-20T10:00:02.500Z',
          },
        },
      });

      const res = await app.request('/v1/admin/traces/trace-1');
      const body = await res.json();
      expect(body.summary.status).toBe('error');
    });

    it('returns 404 when trace not found', async () => {
      mockTraceService.getDetail.mockResolvedValueOnce({
        error: 'Trace not found',
      });

      const res = await app.request('/v1/admin/traces/nonexistent');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Trace not found');
    });
  });
});
