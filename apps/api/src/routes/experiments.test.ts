import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockDatasetsStorage, mockExperimentsStorage, mockGetQueue } = vi.hoisted(() => ({
  mockDatasetsStorage: {
    getDatasetById: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
  mockExperimentsStorage: {
    listExperiments: vi.fn().mockResolvedValue({ experiments: [], total: 0, page: 0, perPage: 100, hasMore: false }),
    createExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'pending' }),
    getExperimentById: vi.fn().mockResolvedValue(null),
    updateExperiment: vi.fn().mockResolvedValue({}),
    deleteExperiment: vi.fn().mockResolvedValue(undefined),
    listExperimentResults: vi.fn().mockResolvedValue({ results: [], total: 0, page: 0, perPage: 100, hasMore: false }),
    deleteExperimentResults: vi.fn().mockResolvedValue(undefined),
  },
  mockGetQueue: vi.fn().mockReturnValue({ add: vi.fn().mockResolvedValue({}) }),
}));

// ---------- Module mocks ----------
vi.mock('../db', () => ({ db: {}, sql: {} }));

vi.mock('@typhoon/db/drivers/pg', () => ({
  DrizzleDatasetsStorage: class {
    getDatasetById = mockDatasetsStorage.getDatasetById;
    listItems = mockDatasetsStorage.listItems;
  },
  DrizzleExperimentsStorage: class {
    listExperiments = mockExperimentsStorage.listExperiments;
    createExperiment = mockExperimentsStorage.createExperiment;
    getExperimentById = mockExperimentsStorage.getExperimentById;
    updateExperiment = mockExperimentsStorage.updateExperiment;
    deleteExperiment = mockExperimentsStorage.deleteExperiment;
    listExperimentResults = mockExperimentsStorage.listExperimentResults;
    deleteExperimentResults = mockExperimentsStorage.deleteExperimentResults;
  },
}));

vi.mock('../queue', () => ({
  getQueue: mockGetQueue,
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
    // biome-ignore lint/suspicious/noExplicitAny: dynamic route mounting for tests
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
      mockExperimentsStorage.listExperiments.mockResolvedValueOnce({
        experiments: [{ id: 'exp-1', name: 'Test', status: 'completed' }],
        total: 1,
        page: 0,
        perPage: 100,
        hasMore: false,
      });

      const res = await app.request('/v1/admin/experiments');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.experiments).toHaveLength(1);
    });
  });

  describe('POST /v1/admin/experiments', () => {
    it('creates an experiment and enqueues job', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', version: 0 });
      mockDatasetsStorage.listItems.mockResolvedValueOnce({ items: [{ id: 'item-1' }], total: 5 });

      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'ds-1', name: 'Test Run' }),
      });

      expect(res.status).toBe(201);
      expect(mockExperimentsStorage.createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: 'ds-1',
          name: 'Test Run',
          status: 'pending',
          totalItems: 5,
        }),
      );
    });

    it('rejects missing datasetId', async () => {
      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No dataset' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects when dataset not found', async () => {
      const res = await app.request('/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'unknown' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects when dataset has no items', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', version: 0 });
      mockDatasetsStorage.listItems.mockResolvedValueOnce({ items: [], total: 0 });

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
      mockExperimentsStorage.getExperimentById.mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Test',
        status: 'completed',
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
      mockExperimentsStorage.getExperimentById.mockResolvedValueOnce({
        id: 'exp-1',
        status: 'running',
      });

      const res = await app.request('/v1/admin/experiments/exp-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.cancelled).toBe(true);
      expect(mockExperimentsStorage.updateExperiment).toHaveBeenCalledWith({ id: 'exp-1', status: 'failed' });
    });

    it('deletes a completed experiment', async () => {
      mockExperimentsStorage.getExperimentById.mockResolvedValueOnce({
        id: 'exp-1',
        status: 'completed',
      });

      const res = await app.request('/v1/admin/experiments/exp-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockExperimentsStorage.deleteExperiment).toHaveBeenCalledWith({ id: 'exp-1' });
    });

    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/v1/admin/experiments/unknown', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/admin/experiments/:id/results', () => {
    it('returns experiment results', async () => {
      mockExperimentsStorage.listExperimentResults.mockResolvedValueOnce({
        results: [{ id: 'r-1', itemId: 'item-1', output: { responseText: 'test' } }],
        total: 1,
        page: 0,
        perPage: 100,
        hasMore: false,
      });

      const res = await app.request('/v1/admin/experiments/exp-1/results');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toHaveLength(1);
    });
  });

  describe('GET /v1/admin/experiments/compare', () => {
    it('compares two experiments on the same dataset', async () => {
      mockExperimentsStorage.getExperimentById
        .mockResolvedValueOnce({ id: 'exp-1', datasetId: 'ds-1', status: 'completed' })
        .mockResolvedValueOnce({ id: 'exp-2', datasetId: 'ds-1', status: 'completed' });

      mockExperimentsStorage.listExperimentResults
        .mockResolvedValueOnce({
          results: [
            {
              itemId: 'item-1',
              input: { question: 'Q' },
              output: { scores: [{ scorerId: 'answerRelevancy', score: 0.8 }] },
            },
          ],
          total: 1,
        })
        .mockResolvedValueOnce({
          results: [
            {
              itemId: 'item-1',
              input: { question: 'Q' },
              output: { scores: [{ scorerId: 'answerRelevancy', score: 0.9 }] },
            },
          ],
          total: 1,
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
      mockExperimentsStorage.getExperimentById
        .mockResolvedValueOnce({ id: 'exp-1', datasetId: 'ds-1' })
        .mockResolvedValueOnce({ id: 'exp-2', datasetId: 'ds-2' });

      const res = await app.request('/v1/admin/experiments/compare?a=exp-1&b=exp-2');
      expect(res.status).toBe(400);
    });
  });
});
