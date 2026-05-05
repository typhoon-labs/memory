import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockDatasetsStorage } = vi.hoisted(() => ({
  mockDatasetsStorage: {
    listDatasets: vi.fn().mockResolvedValue({ datasets: [], total: 0, page: 0, perPage: 100, hasMore: false }),
    createDataset: vi.fn().mockResolvedValue({ id: 'ds-1', name: 'Test', version: 0 }),
    getDatasetById: vi.fn().mockResolvedValue(null),
    _doUpdateDataset: vi.fn().mockResolvedValue({ id: 'ds-1', name: 'Updated' }),
    deleteDataset: vi.fn().mockResolvedValue(undefined),
    listItems: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, perPage: 100, hasMore: false }),
    _doAddItem: vi.fn().mockResolvedValue({ id: 'item-1' }),
    _doBatchInsertItems: vi.fn().mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }]),
    _doUpdateItem: vi.fn().mockResolvedValue({ id: 'item-1', input: { question: 'updated' } }),
    _doDeleteItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------- Module mocks ----------
vi.mock('../db', () => ({ db: {}, sql: {} }));

vi.mock('@typhoon/db/drivers/pg', () => ({
  DrizzleDatasetsStorage: class {
    listDatasets = mockDatasetsStorage.listDatasets;
    createDataset = mockDatasetsStorage.createDataset;
    getDatasetById = mockDatasetsStorage.getDatasetById;
    _doUpdateDataset = mockDatasetsStorage._doUpdateDataset;
    deleteDataset = mockDatasetsStorage.deleteDataset;
    listItems = mockDatasetsStorage.listItems;
    _doAddItem = mockDatasetsStorage._doAddItem;
    _doBatchInsertItems = mockDatasetsStorage._doBatchInsertItems;
    _doUpdateItem = mockDatasetsStorage._doUpdateItem;
    _doDeleteItem = mockDatasetsStorage._doDeleteItem;
  },
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
import { datasetRoutes } from './datasets';

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
describe('Dataset Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = mountRoutes(datasetRoutes as unknown as Record<string, unknown>[]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('route structure', () => {
    it('has 9 routes, all using requireAuth and requireAdmin', () => {
      expect(datasetRoutes).toHaveLength(9);
      for (const route of datasetRoutes as unknown as Record<string, unknown>[]) {
        const mid = route.middleware as unknown[];
        expect(mid).toHaveLength(2);
      }
    });
  });

  describe('GET /v1/admin/datasets', () => {
    it('returns dataset list', async () => {
      mockDatasetsStorage.listDatasets.mockResolvedValueOnce({
        datasets: [{ id: 'ds-1', name: 'Test' }],
        total: 1,
        page: 0,
        perPage: 100,
        hasMore: false,
      });

      const res = await app.request('/v1/admin/datasets');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.datasets).toHaveLength(1);
      expect(body.datasets[0].id).toBe('ds-1');
    });

    it('returns empty list when no datasets', async () => {
      const res = await app.request('/v1/admin/datasets');
      const body = await res.json();
      expect(body.datasets).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('POST /v1/admin/datasets', () => {
    it('creates a dataset', async () => {
      const res = await app.request('/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Dataset', description: 'Test' }),
      });

      expect(res.status).toBe(201);
      expect(mockDatasetsStorage.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Dataset', description: 'Test' }),
      );
    });

    it('rejects missing name', async () => {
      const res = await app.request('/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'No name' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/admin/datasets/:id', () => {
    it('returns dataset by ID', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', name: 'Test' });

      const res = await app.request('/v1/admin/datasets/ds-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('ds-1');
    });

    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/v1/admin/datasets/unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /v1/admin/datasets/:id', () => {
    it('updates a dataset', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', name: 'Old' });

      const res = await app.request('/v1/admin/datasets/ds-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(res.status).toBe(200);
      expect(mockDatasetsStorage._doUpdateDataset).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ds-1', name: 'Updated' }),
      );
    });

    it('returns 404 for unknown ID', async () => {
      const res = await app.request('/v1/admin/datasets/unknown', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/datasets/:id', () => {
    it('deletes a dataset', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1' });

      const res = await app.request('/v1/admin/datasets/ds-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockDatasetsStorage.deleteDataset).toHaveBeenCalledWith({ id: 'ds-1' });
    });
  });

  describe('GET /v1/admin/datasets/:id/items', () => {
    it('returns dataset items', async () => {
      mockDatasetsStorage.listItems.mockResolvedValueOnce({
        items: [{ id: 'item-1', input: { question: 'test' } }],
        total: 1,
        page: 0,
        perPage: 100,
        hasMore: false,
      });

      const res = await app.request('/v1/admin/datasets/ds-1/items');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
    });
  });

  describe('POST /v1/admin/datasets/:id/items', () => {
    it('adds a single item', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', version: 0 });

      const res = await app.request('/v1/admin/datasets/ds-1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'What is X?' }, groundTruth: { answer: 'X is Y' } }),
      });

      expect(res.status).toBe(201);
      expect(mockDatasetsStorage._doAddItem).toHaveBeenCalled();
    });

    it('adds items in batch', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', version: 0 });

      const res = await app.request('/v1/admin/datasets/ds-1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ input: { question: 'Q1' } }, { input: { question: 'Q2' } }],
        }),
      });

      expect(res.status).toBe(201);
      expect(mockDatasetsStorage._doBatchInsertItems).toHaveBeenCalled();
    });

    it('returns 404 when dataset not found', async () => {
      const res = await app.request('/v1/admin/datasets/unknown/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'test' } }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects missing input for single item', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', version: 0 });

      const res = await app.request('/v1/admin/datasets/ds-1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groundTruth: { answer: 'test' } }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /v1/admin/datasets/:id/items/:itemId', () => {
    it('updates an item', async () => {
      mockDatasetsStorage.getDatasetById.mockResolvedValueOnce({ id: 'ds-1', version: 0 });
      mockDatasetsStorage._doUpdateItem.mockResolvedValueOnce({ id: 'item-1', input: { question: 'updated' } });

      const res = await app.request('/v1/admin/datasets/ds-1/items/item-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'updated' } }),
      });

      expect(res.status).toBe(200);
      expect(mockDatasetsStorage._doUpdateItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }));
    });

    it('returns 404 when dataset not found', async () => {
      const res = await app.request('/v1/admin/datasets/unknown/items/item-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'updated' } }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/datasets/:id/items/:itemId', () => {
    it('deletes an item', async () => {
      const res = await app.request('/v1/admin/datasets/ds-1/items/item-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockDatasetsStorage._doDeleteItem).toHaveBeenCalledWith({ id: 'item-1', datasetId: 'ds-1' });
    });
  });
});
