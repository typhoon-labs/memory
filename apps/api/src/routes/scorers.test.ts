import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockScorerService } = vi.hoisted(() => ({
  mockScorerService: {
    getModels: vi.fn().mockReturnValue({ data: { models: ['model-a'], defaultModel: 'model-a' } }),
    list: vi.fn().mockResolvedValue({ data: { scorers: [], total: 0, page: 0, perPage: 100, hasMore: false } }),
    create: vi.fn().mockResolvedValue({ data: { id: 'def-1', name: 'test', versionId: 'ver-1' } }),
    getById: vi.fn().mockResolvedValue({ error: 'not-found' }),
    update: vi.fn().mockResolvedValue({ data: { id: 'def-1', status: 'active' } }),
    delete: vi.fn().mockResolvedValue({ data: { ok: true } }),
    listVersions: vi
      .fn()
      .mockResolvedValue({ data: { versions: [], total: 0, page: 0, perPage: 100, hasMore: false } }),
    createVersion: vi.fn().mockResolvedValue({ data: { id: 'ver-1', versionNumber: 1 } }),
    publishVersion: vi.fn().mockResolvedValue({ data: { id: 'def-1', status: 'active' } }),
    previewScore: vi.fn().mockResolvedValue({ data: { score: 0.85, reason: 'Good', durationMs: 100 } }),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getScorerService: () => mockScorerService,
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

vi.mock('@typhoon/ai', () => ({
  createScoringModel: vi.fn().mockReturnValue('mock-model'),
}));

// ---------- Import module under test ----------
import { scorerRoutes } from './scorers';

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
describe('Scorer Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = mountRoutes(scorerRoutes as unknown as Record<string, unknown>[]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('route structure', () => {
    it('has 10 routes, all using requireAuth and requireAdmin', () => {
      expect(scorerRoutes).toHaveLength(10);
      for (const route of scorerRoutes as unknown as Record<string, unknown>[]) {
        const mid = route.middleware as Array<{ name: string }>;
        expect(mid).toHaveLength(2);
      }
    });
  });

  describe('GET /v1/admin/scorers/models', () => {
    it('returns models from service', async () => {
      mockScorerService.getModels.mockReturnValueOnce({
        data: { models: ['model-a', 'model-b'], defaultModel: 'model-a' },
      });

      const res = await app.request('/v1/admin/scorers/models');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.models).toEqual(['model-a', 'model-b']);
      expect(body.defaultModel).toBe('model-a');
    });
  });

  describe('GET /v1/admin/scorers', () => {
    it('returns scorer list with correct shape', async () => {
      mockScorerService.list.mockResolvedValueOnce({
        data: {
          scorers: [{ id: 'def-1', name: 'faithfulness', type: 'faithfulness', status: 'active', versionNumber: 1 }],
          total: 1,
          page: 0,
          perPage: 100,
          hasMore: false,
        },
      });

      const res = await app.request('/v1/admin/scorers');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.scorers).toHaveLength(1);
      expect(body.scorers[0].id).toBe('def-1');
      expect(body.scorers[0].name).toBe('faithfulness');
      expect(body.scorers[0].type).toBe('faithfulness');
      expect(body.scorers[0].status).toBe('active');
      expect(body.scorers[0].versionNumber).toBe(1);
      expect(body.total).toBe(1);
      expect(body.hasMore).toBe(false);
    });

    it('returns empty list when no scorers', async () => {
      const res = await app.request('/v1/admin/scorers');
      const body = await res.json();
      expect(body.scorers).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('POST /v1/admin/scorers', () => {
    it('creates definition + initial version, returns 201', async () => {
      mockScorerService.create.mockResolvedValueOnce({
        data: { id: 'def-1', name: 'faithfulness', versionId: 'ver-1' },
      });

      const res = await app.request('/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'faithfulness', type: 'faithfulness', description: 'Test scorer' }),
      });

      expect(res.status).toBe(201);
      expect(mockScorerService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'faithfulness', type: 'faithfulness' }),
      );
      const body = await res.json();
      expect(body.name).toBe('faithfulness');
    });

    it('validates required fields', async () => {
      mockScorerService.create.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'name is required',
      });

      const res = await app.request('/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Missing name and type' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toContain('name');
    });

    it('rejects missing type', async () => {
      mockScorerService.create.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'type is required',
      });

      const res = await app.request('/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toContain('type');
    });
  });

  describe('GET /v1/admin/scorers/:id', () => {
    it('returns scorer with active version', async () => {
      mockScorerService.getById.mockResolvedValueOnce({
        data: { id: 'def-1', name: 'faithfulness', status: 'active' },
      });

      const res = await app.request('/v1/admin/scorers/def-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('def-1');
      expect(body.name).toBe('faithfulness');
    });

    it('returns 404 for unknown scorer', async () => {
      const res = await app.request('/v1/admin/scorers/nonexistent');
      expect(res.status).toBe(404);
    });

    it('falls back to latest version when no active version', async () => {
      mockScorerService.getById.mockResolvedValueOnce({
        data: { id: 'def-1', name: 'fallback-name', versionId: 'ver-1' },
      });

      const res = await app.request('/v1/admin/scorers/def-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('fallback-name');
    });
  });

  describe('PATCH /v1/admin/scorers/:id', () => {
    it('updates scorer status', async () => {
      mockScorerService.update.mockResolvedValueOnce({
        data: { id: 'def-1', status: 'archived' },
      });

      const res = await app.request('/v1/admin/scorers/def-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      expect(res.status).toBe(200);
      expect(mockScorerService.update).toHaveBeenCalledWith('def-1', expect.objectContaining({ status: 'archived' }));
    });

    it('returns 404 for unknown scorer', async () => {
      mockScorerService.update.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/scorers/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/scorers/:id', () => {
    it('deletes scorer', async () => {
      const res = await app.request('/v1/admin/scorers/def-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockScorerService.delete).toHaveBeenCalledWith('def-1');
    });

    it('returns 404 for unknown scorer', async () => {
      mockScorerService.delete.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/scorers/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/admin/scorers/:id/versions', () => {
    it('returns version history', async () => {
      mockScorerService.listVersions.mockResolvedValueOnce({
        data: {
          versions: [
            { id: 'ver-1', versionNumber: 1 },
            { id: 'ver-2', versionNumber: 2 },
          ],
          total: 2,
          page: 0,
          perPage: 100,
          hasMore: false,
        },
      });

      const res = await app.request('/v1/admin/scorers/def-1/versions');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.versions).toHaveLength(2);
      expect(body.versions[0].versionNumber).toBe(1);
      expect(body.total).toBe(2);
    });
  });

  describe('POST /v1/admin/scorers/:id/versions', () => {
    it('creates new version with incremented number', async () => {
      mockScorerService.createVersion.mockResolvedValueOnce({
        data: { id: 'ver-3', versionNumber: 3, changeMessage: 'Updated instructions' },
      });

      const res = await app.request('/v1/admin/scorers/def-1/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'faithfulness',
          type: 'faithfulness',
          changeMessage: 'Updated instructions',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.versionNumber).toBe(3);
      expect(body.changeMessage).toBe('Updated instructions');
    });

    it('returns 404 for unknown scorer', async () => {
      mockScorerService.createVersion.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/scorers/nonexistent/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', type: 'custom' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/admin/scorers/:id/publish', () => {
    it('publishes latest version when no versionId specified', async () => {
      mockScorerService.publishVersion.mockResolvedValueOnce({
        data: { id: 'def-1', status: 'active', activeVersionId: 'ver-2' },
      });

      const res = await app.request('/v1/admin/scorers/def-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(mockScorerService.publishVersion).toHaveBeenCalledWith('def-1', undefined);
    });

    it('publishes specific version', async () => {
      mockScorerService.publishVersion.mockResolvedValueOnce({
        data: { id: 'def-1', status: 'active', activeVersionId: 'ver-1' },
      });

      const res = await app.request('/v1/admin/scorers/def-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver-1' }),
      });

      expect(res.status).toBe(200);
      expect(mockScorerService.publishVersion).toHaveBeenCalledWith('def-1', 'ver-1');
    });

    it('returns 404 for unknown scorer', async () => {
      mockScorerService.publishVersion.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/scorers/nonexistent/publish', { method: 'POST' });
      expect(res.status).toBe(404);
    });

    it('returns 404 for unknown version', async () => {
      mockScorerService.publishVersion.mockResolvedValueOnce({ error: 'version-not-found' });

      const res = await app.request('/v1/admin/scorers/def-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'nonexistent' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/admin/scorers/:id/preview', () => {
    it('runs scorer and returns score + reason', async () => {
      mockScorerService.previewScore.mockResolvedValueOnce({
        data: { score: 0.85, reason: 'Well-grounded response', durationMs: 150 },
      });

      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: 'The answer is 42',
          context: ['The answer to everything is 42'],
          question: 'What is the answer?',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.score).toBe(0.85);
      expect(body.reason).toBe('Well-grounded response');
      expect(body.durationMs).toBeTypeOf('number');
    });

    it('validates required fields', async () => {
      mockScorerService.previewScore.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'response and question are required',
      });

      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ['some context'] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toContain('required');
    });

    it('returns 400 with message when retrieval scorer has no context', async () => {
      mockScorerService.previewScore.mockResolvedValueOnce({
        error: 'validation-failed',
        details: 'This scorer type (contextRelevance) requires context chunks to evaluate.',
      });

      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'test', question: 'test', context: [] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details).toContain('requires context');
    });

    it('returns 404 when no version found', async () => {
      mockScorerService.previewScore.mockResolvedValueOnce({ error: 'version-not-found' });

      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'test', question: 'test', context: [] }),
      });

      expect(res.status).toBe(404);
    });
  });
});
