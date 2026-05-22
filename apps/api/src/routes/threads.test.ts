import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockThreadService } = vi.hoisted(() => ({
  mockThreadService: {
    listThreads: vi.fn(),
    getThread: vi.fn(),
    createThread: vi.fn(),
    updateThread: vi.fn(),
    deleteThread: vi.fn(),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getThreadService: () => mockThreadService,
}));

const mockUser = { id: 'user-1', email: 'test@example.com' };

vi.mock('../middleware/require-auth', () => ({
  requireAuth: createMiddleware(async (c, next) => {
    c.set('user' as never, mockUser);
    await next();
  }),
}));

// ---------- Import module under test (after mocks) ----------
import { threadRoutes } from './threads';

// ---------- Helper to mount routes on a Hono app ----------
function mountRoutes(routes: Record<string, unknown>[]) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

// ---------- Factory helpers ----------
const now = new Date('2026-01-15T10:00:00Z');

function makeThreadResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ext-thread-1',
    resourceId: 'user-1',
    title: 'My Chat',
    metadata: { key: 'value' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeUIMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-ext-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello there' }],
    createdAt: now,
    ...overrides,
  };
}

// ---------- Tests ----------

describe('threadRoutes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = mountRoutes(threadRoutes as unknown as Record<string, unknown>[]);
  });

  // ==========================================================================
  // GET /v1/threads — list
  // ==========================================================================

  describe('GET /v1/threads', () => {
    it('returns paginated thread list with defaults (page=0, perPage=20)', async () => {
      const threads = [makeThreadResponse(), makeThreadResponse({ id: 'ext-thread-2' })];
      mockThreadService.listThreads.mockResolvedValueOnce({
        data: {
          threads,
          total: 2,
          page: 0,
          perPage: 20,
          hasMore: false,
        },
      });

      const res = await app.request('/v1/threads');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(0);
      expect(body.perPage).toBe(20);
      expect(body.hasMore).toBe(false);
    });

    it('passes page and perPage query params to service', async () => {
      mockThreadService.listThreads.mockResolvedValueOnce({
        data: {
          threads: [makeThreadResponse()],
          total: 50,
          page: 1,
          perPage: 10,
          hasMore: true,
        },
      });

      const res = await app.request('/v1/threads?page=1&perPage=10');
      const body = await res.json();

      expect(body.page).toBe(1);
      expect(body.perPage).toBe(10);
      expect(body.hasMore).toBe(true);
      expect(mockThreadService.listThreads).toHaveBeenCalledWith({
        userId: 'user-1',
        page: 1,
        perPage: 10,
      });
    });

    it('returns empty array when user has no threads', async () => {
      mockThreadService.listThreads.mockResolvedValueOnce({
        data: { threads: [], total: 0, page: 0, perPage: 20, hasMore: false },
      });

      const res = await app.request('/v1/threads');
      const body = await res.json();

      expect(body.threads).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('maps thread rows using toThreadResponse (externalId as id)', async () => {
      const thread = makeThreadResponse({
        id: 'ext-1',
        resourceId: 'user-1',
        title: 'Chat Title',
        metadata: { tag: 'support' },
      });
      mockThreadService.listThreads.mockResolvedValueOnce({
        data: { threads: [thread], total: 1, page: 0, perPage: 20, hasMore: false },
      });

      const res = await app.request('/v1/threads');
      const body = await res.json();

      expect(body.threads[0]).toEqual({
        id: 'ext-1',
        resourceId: 'user-1',
        title: 'Chat Title',
        metadata: { tag: 'support' },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });
  });

  // ==========================================================================
  // GET /v1/threads/:threadId — single thread
  // ==========================================================================

  describe('GET /v1/threads/:threadId', () => {
    it('returns thread with messages', async () => {
      const thread = makeThreadResponse();
      const msg = makeUIMessage({ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] });

      mockThreadService.getThread.mockResolvedValueOnce({
        data: { ...thread, messages: [msg] },
      });

      const res = await app.request('/v1/threads/ext-thread-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('ext-thread-1');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].id).toBe('msg-1');
      expect(body.messages[0].role).toBe('user');
    });

    it('returns 404 when thread does not exist', async () => {
      mockThreadService.getThread.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/threads/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('returns 404 when thread belongs to a different user', async () => {
      mockThreadService.getThread.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/threads/other-users-thread');
      expect(res.status).toBe(404);
    });

    it('returns thread with empty messages array when no messages exist', async () => {
      const thread = makeThreadResponse();
      mockThreadService.getThread.mockResolvedValueOnce({
        data: { ...thread, messages: [] },
      });

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages).toEqual([]);
    });

    it('calls service with threadId and userId', async () => {
      mockThreadService.getThread.mockResolvedValueOnce({
        data: { ...makeThreadResponse(), messages: [] },
      });

      await app.request('/v1/threads/ext-thread-1');

      expect(mockThreadService.getThread).toHaveBeenCalledWith({
        threadId: 'ext-thread-1',
        userId: 'user-1',
      });
    });
  });

  // ==========================================================================
  // POST /v1/threads — create
  // ==========================================================================

  describe('POST /v1/threads', () => {
    it('creates a thread and returns 201', async () => {
      const created = makeThreadResponse({ title: 'New Chat' });
      mockThreadService.createThread.mockResolvedValueOnce({ data: created });

      const res = await app.request('/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('ext-thread-1');
      expect(body.title).toBe('New Chat');
    });

    it('uses default title when not provided', async () => {
      const created = makeThreadResponse({ title: '' });
      mockThreadService.createThread.mockResolvedValueOnce({ data: created });

      const res = await app.request('/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe('');
    });

    it('accepts optional metadata', async () => {
      const meta = { source: 'widget', lang: 'en' };
      const created = makeThreadResponse({ title: 'With Meta', metadata: meta });
      mockThreadService.createThread.mockResolvedValueOnce({ data: created });

      const res = await app.request('/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'With Meta', metadata: meta }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.metadata).toEqual(meta);
    });

    it('passes correct values to service', async () => {
      mockThreadService.createThread.mockResolvedValueOnce({ data: makeThreadResponse() });

      await app.request('/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(mockThreadService.createThread).toHaveBeenCalledWith({
        userId: 'user-1',
        title: 'Test',
        metadata: {},
      });
    });
  });

  // ==========================================================================
  // PATCH /v1/threads/:threadId — update
  // ==========================================================================

  describe('PATCH /v1/threads/:threadId', () => {
    it('updates title and returns updated thread', async () => {
      const updated = makeThreadResponse({ title: 'Updated Title' });
      mockThreadService.updateThread.mockResolvedValueOnce({ data: updated });

      const res = await app.request('/v1/threads/ext-thread-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Updated Title');
    });

    it('updates metadata', async () => {
      const newMeta = { resolved: true };
      const updated = makeThreadResponse({ metadata: newMeta });
      mockThreadService.updateThread.mockResolvedValueOnce({ data: updated });

      const res = await app.request('/v1/threads/ext-thread-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: newMeta }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata).toEqual(newMeta);
    });

    it('returns 404 when thread not found', async () => {
      mockThreadService.updateThread.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/threads/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('passes title and metadata to service', async () => {
      mockThreadService.updateThread.mockResolvedValueOnce({ data: makeThreadResponse() });

      await app.request('/v1/threads/ext-thread-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'X', metadata: { a: 1 } }),
      });

      expect(mockThreadService.updateThread).toHaveBeenCalledWith({
        threadId: 'ext-thread-1',
        userId: 'user-1',
        title: 'X',
        metadata: { a: 1 },
      });
    });

    it('does not include title in service call when not provided', async () => {
      mockThreadService.updateThread.mockResolvedValueOnce({ data: makeThreadResponse() });

      await app.request('/v1/threads/ext-thread-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { a: 1 } }),
      });

      expect(mockThreadService.updateThread).toHaveBeenCalledWith({
        threadId: 'ext-thread-1',
        userId: 'user-1',
        title: undefined,
        metadata: { a: 1 },
      });
    });
  });

  // ==========================================================================
  // DELETE /v1/threads/:threadId — delete
  // ==========================================================================

  describe('DELETE /v1/threads/:threadId', () => {
    it('deletes thread and returns { ok: true }', async () => {
      mockThreadService.deleteThread.mockResolvedValueOnce({ data: { ok: true } });

      const res = await app.request('/v1/threads/ext-thread-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it('returns 404 when thread does not exist', async () => {
      mockThreadService.deleteThread.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/threads/nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('returns 404 when thread belongs to different user', async () => {
      mockThreadService.deleteThread.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/threads/other-users-thread', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });

    it('passes threadId and userId to service', async () => {
      mockThreadService.deleteThread.mockResolvedValueOnce({ data: { ok: true } });

      await app.request('/v1/threads/ext-thread-1', {
        method: 'DELETE',
      });

      expect(mockThreadService.deleteThread).toHaveBeenCalledWith({
        threadId: 'ext-thread-1',
        userId: 'user-1',
      });
    });
  });

  // ==========================================================================
  // Route structure
  // ==========================================================================

  describe('route structure', () => {
    it('exports five routes', () => {
      expect(threadRoutes).toHaveLength(5);
    });

    it('all routes use requireAuth middleware', () => {
      for (const route of threadRoutes as unknown as Record<string, unknown>[]) {
        const mid = Array.isArray(route.middleware) ? route.middleware : [route.middleware];
        expect(mid.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('defines correct HTTP methods and paths', () => {
      const routes = threadRoutes as unknown as { path: string; method: string }[];
      const specs = routes.map((r) => ({ path: r.path, method: r.method }));

      expect(specs).toContainEqual({ path: '/v1/threads', method: 'GET' });
      expect(specs).toContainEqual({ path: '/v1/threads', method: 'POST' });
      expect(specs).toContainEqual({ path: '/v1/threads/:threadId', method: 'GET' });
      expect(specs).toContainEqual({ path: '/v1/threads/:threadId', method: 'PATCH' });
      expect(specs).toContainEqual({ path: '/v1/threads/:threadId', method: 'DELETE' });
    });
  });
});
