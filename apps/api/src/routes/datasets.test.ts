import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockDatasetService } = vi.hoisted(() => ({
  mockDatasetService: {
    list: vi.fn().mockResolvedValue({ data: { datasets: [], total: 0, page: 0, perPage: 100, hasMore: false } }),
    create: vi.fn().mockResolvedValue({ data: { id: 'ds-1', name: 'Test', version: 0 } }),
    getById: vi.fn().mockResolvedValue({ error: 'not-found' }),
    update: vi.fn().mockResolvedValue({ data: { id: 'ds-1', name: 'Updated' } }),
    delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
    listItems: vi.fn().mockResolvedValue({ data: { items: [], total: 0, page: 0, perPage: 100, hasMore: false } }),
    addItems: vi.fn().mockResolvedValue({ data: { id: 'item-1' } }),
    updateItem: vi.fn().mockResolvedValue({ data: { id: 'item-1', input: { question: 'updated' } } }),
    deleteItem: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getDatasetService: () => mockDatasetService,
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
      mockDatasetService.list.mockResolvedValueOnce({
        data: {
          datasets: [{ id: 'ds-1', name: 'Test' }],
          total: 1,
          page: 0,
          perPage: 100,
          hasMore: false,
        },
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
      mockDatasetService.create.mockResolvedValueOnce({
        data: { id: 'ds-1', name: 'My Dataset', description: 'Test', _status: 201 },
      });

      const res = await app.request('/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Dataset', description: 'Test' }),
      });

      expect(res.status).toBe(201);
      expect(mockDatasetService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Dataset', description: 'Test' }),
      );
    });

    it('rejects missing name', async () => {
      mockDatasetService.create.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'name is required',
      });

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
      mockDatasetService.getById.mockResolvedValueOnce({
        data: { id: 'ds-1', name: 'Test' },
      });

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
      mockDatasetService.update.mockResolvedValueOnce({
        data: { id: 'ds-1', name: 'Updated' },
      });

      const res = await app.request('/v1/admin/datasets/ds-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(res.status).toBe(200);
      expect(mockDatasetService.update).toHaveBeenCalledWith('ds-1', expect.objectContaining({ name: 'Updated' }));
    });

    it('returns 404 for unknown ID', async () => {
      mockDatasetService.update.mockResolvedValueOnce({ error: 'not-found' });

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
      const res = await app.request('/v1/admin/datasets/ds-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockDatasetService.delete).toHaveBeenCalledWith('ds-1');
    });
  });

  describe('GET /v1/admin/datasets/:id/items', () => {
    it('returns dataset items', async () => {
      mockDatasetService.listItems.mockResolvedValueOnce({
        data: {
          items: [{ id: 'item-1', input: { question: 'test' } }],
          total: 1,
          page: 0,
          perPage: 100,
          hasMore: false,
        },
      });

      const res = await app.request('/v1/admin/datasets/ds-1/items');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
    });
  });

  describe('POST /v1/admin/datasets/:id/items', () => {
    it('adds a single item', async () => {
      mockDatasetService.addItems.mockResolvedValueOnce({
        data: { id: 'item-1', input: { question: 'What is X?' }, _status: 201 },
      });

      const res = await app.request('/v1/admin/datasets/ds-1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'What is X?' }, groundTruth: { answer: 'X is Y' } }),
      });

      expect(res.status).toBe(201);
      expect(mockDatasetService.addItems).toHaveBeenCalled();
    });

    it('adds items in batch', async () => {
      mockDatasetService.addItems.mockResolvedValueOnce({
        data: { items: [{ id: 'item-1' }, { id: 'item-2' }], _status: 201 },
      });

      const res = await app.request('/v1/admin/datasets/ds-1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ input: { question: 'Q1' } }, { input: { question: 'Q2' } }],
        }),
      });

      expect(res.status).toBe(201);
      expect(mockDatasetService.addItems).toHaveBeenCalled();
    });

    it('returns 404 when dataset not found', async () => {
      mockDatasetService.addItems.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/datasets/unknown/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'test' } }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects missing input for single item', async () => {
      mockDatasetService.addItems.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'input is required',
      });

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
      mockDatasetService.updateItem.mockResolvedValueOnce({
        data: { id: 'item-1', input: { question: 'updated' } },
      });

      const res = await app.request('/v1/admin/datasets/ds-1/items/item-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { question: 'updated' } }),
      });

      expect(res.status).toBe(200);
      expect(mockDatasetService.updateItem).toHaveBeenCalledWith(
        'ds-1',
        'item-1',
        expect.objectContaining({ input: { question: 'updated' } }),
      );
    });

    it('returns 404 when dataset not found', async () => {
      mockDatasetService.updateItem.mockResolvedValueOnce({ error: 'not-found' });

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
      expect(mockDatasetService.deleteItem).toHaveBeenCalledWith('ds-1', 'item-1');
    });
  });
});
