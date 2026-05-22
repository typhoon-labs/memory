import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockExperimentService } = vi.hoisted(() => ({
  mockExperimentService: {
    list: vi.fn().mockResolvedValue({ data: { experiments: [], total: 0, page: 0, perPage: 100, hasMore: false } }),
    create: vi.fn().mockResolvedValue({ data: { id: 'exp-1', status: 'pending' } }),
    getById: vi.fn().mockResolvedValue({ error: 'not-found' }),
    delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
    getResults: vi.fn().mockResolvedValue({ data: { results: [], total: 0, page: 0, perPage: 100, hasMore: false } }),
    compare: vi.fn().mockResolvedValue({ data: { experimentA: {}, experimentB: {}, aggregate: {}, items: [] } }),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getExperimentService: () => mockExperimentService,
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

// ---------- Import module under test ----------
import { experimentRoutes } from './experiments';

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
describe('Experiment Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = mountRoutes(experimentRoutes as unknown as Record<string, unknown>[]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('route structure', () => {
    it('has 6 routes, all using requireAuth and requireAdmin', () => {
      expect(experimentRoutes).toHaveLength(6);
      for (const route of experimentRoutes as unknown as Record<string, unknown>[]) {
        const mid = route.middleware as unknown[];
        expect(mid).toHaveLength(2);
      }
    });
  });

  describe('GET /v1/admin/experiments', () => {
    it('returns experiment list', async () => {
      mockExperimentService.list.mockResolvedValueOnce({
        data: {
          experiments: [{ id: 'exp-1', name: 'Test', status: 'completed' }],
          total: 1,
          page: 0,
          perPage: 100,
          hasMore: false,
        },
      });

      const res = await app.request('/v1/admin/experiments');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.experiments).toHaveLength(1);
    });
  });

  describe('POST /v1/admin/experiments', () => {
    it('creates an experiment and enqueues job', async () => {
      mockExperimentService.create.mockResolvedValueOnce({
        data: { id: 'exp-1', datasetId: 'ds-1', name: 'Test Run', status: 'pending', totalItems: 5, _status: 201 },
      });

      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'ds-1', name: 'Test Run' }),
      });

      expect(res.status).toBe(201);
      expect(mockExperimentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ datasetId: 'ds-1', name: 'Test Run' }),
      );
    });

    it('rejects missing datasetId', async () => {
      mockExperimentService.create.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'datasetId is required',
      });

      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No dataset' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects when dataset not found', async () => {
      mockExperimentService.create.mockResolvedValueOnce({ error: 'dataset-not-found' });

      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'unknown' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects when dataset has no items', async () => {
      mockExperimentService.create.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'Dataset has no items',
      });

      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'ds-1' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/admin/experiments/:id', () => {
    it('returns experiment by ID', async () => {
      mockExperimentService.getById.mockResolvedValueOnce({
        data: { id: 'exp-1', name: 'Test', status: 'completed' },
      });

      const res = await app.request('/v1/admin/experiments/exp-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('exp-1');
    });

    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/v1/admin/experiments/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/experiments/:id', () => {
    it('cancels a running experiment', async () => {
      mockExperimentService.delete.mockResolvedValueOnce({
        data: { ok: true, cancelled: true },
      });

      const res = await app.request('/v1/admin/experiments/exp-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cancelled).toBe(true);
    });

    it('deletes a completed experiment', async () => {
      mockExperimentService.delete.mockResolvedValueOnce({
        data: { ok: true },
      });

      const res = await app.request('/v1/admin/experiments/exp-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockExperimentService.delete).toHaveBeenCalledWith('exp-1');
    });

    it('returns 404 for unknown ID', async () => {
      mockExperimentService.delete.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/experiments/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/admin/experiments/:id/results', () => {
    it('returns experiment results', async () => {
      mockExperimentService.getResults.mockResolvedValueOnce({
        data: {
          results: [{ id: 'r-1', itemId: 'item-1', output: { responseText: 'test' } }],
          total: 1,
          page: 0,
          perPage: 100,
          hasMore: false,
        },
      });

      const res = await app.request('/v1/admin/experiments/exp-1/results');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toHaveLength(1);
    });
  });

  describe('GET /v1/admin/experiments/compare', () => {
    it('compares two experiments on the same dataset', async () => {
      mockExperimentService.compare.mockResolvedValueOnce({
        data: {
          experimentA: { id: 'exp-1', datasetId: 'ds-1', status: 'completed' },
          experimentB: { id: 'exp-2', datasetId: 'ds-1', status: 'completed' },
          aggregate: {
            avgScoreA: 0.8,
            avgScoreB: 0.9,
            delta: 0.1,
            regressionCount: 0,
            improvementCount: 1,
          },
          items: [{ itemId: 'item-1', input: { question: 'Q' }, resultA: {}, resultB: {}, scoreDelta: 0.1 }],
        },
      });

      const res = await app.request('/v1/admin/experiments/compare?a=exp-1&b=exp-2');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.aggregate.avgScoreA).toBe(0.8);
      expect(body.aggregate.avgScoreB).toBe(0.9);
      expect(body.aggregate.delta).toBeCloseTo(0.1);
      expect(body.aggregate.improvementCount).toBe(1);
      expect(body.items).toHaveLength(1);
    });

    it('rejects missing params', async () => {
      const res = await app.request('/v1/admin/experiments/compare?a=exp-1');
      expect(res.status).toBe(400);
    });

    it('rejects experiments from different datasets', async () => {
      mockExperimentService.compare.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'Experiments must share the same dataset for comparison',
      });

      const res = await app.request('/v1/admin/experiments/compare?a=exp-1&b=exp-2');
      expect(res.status).toBe(400);
    });
  });
});
