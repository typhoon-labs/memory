import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '../../../../tests/helpers/api-test-utils';

// ---------- Hoisted mocks ----------
const { mockSelect, mockInsert, mockUpdate, mockDelete, mockTransaction, mockSql, mockHydrateChunkSources } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockTransaction: vi.fn(),
    mockSql: vi.fn(),
    mockHydrateChunkSources: vi.fn().mockResolvedValue(undefined),
  }));

// ---------- 3. Module mocks ----------
vi.mock('../db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  },
  sql: mockSql,
}));

vi.mock('./hydrate-chunks', () => ({
  hydrateChunkSources: mockHydrateChunkSources,
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class MockPgVector {},
}));

const mockUser = { id: 'user-1', email: 'test@example.com' };

vi.mock('../middleware/require-auth', () => ({
  requireAuth: createMiddleware(async (c, next) => {
    c.set('user' as never, mockUser);
    await next();
  }),
}));

// ---------- 4. Import module under test (after mocks) ----------
import { threadRoutes } from './threads';

// ---------- 5. Helper to mount routes on a Hono app ----------
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

// ---------- 6. Factory helpers ----------
const now = new Date('2026-01-15T10:00:00Z');

function makeThreadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'internal-uuid-1',
    externalId: 'ext-thread-1',
    resourceId: 'user-1',
    title: 'My Chat',
    metadata: { key: 'value' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-internal-1',
    externalId: 'msg-ext-1',
    threadId: 'internal-uuid-1',
    role: 'user',
    type: 'text',
    content: { content: 'Hello there' },
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
  // Pure function tests (via route responses)
  // ==========================================================================

  describe('normalizeToolPart (tested via GET /v1/threads/:threadId)', () => {
    it('converts v4 tool-invocation with result to v6 output-available format', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: {
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolCallId: 'call-1',
                toolName: 'searchKnowledge',
                args: { query: 'pto' },
                result: { text: 'PTO is 20 days' },
              },
            },
          ],
        },
      });

      // First select (thread lookup) resolves to thread
      mockSelect.mockReturnValueOnce(chainable([thread]));
      // Second select (messages) resolves to messages
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.messages[0].parts[0]).toEqual({
        type: 'tool-searchKnowledge',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { query: 'pto' },
        output: { text: 'PTO is 20 days' },
      });
    });

    it('converts v4 tool-invocation with state "call" to v6 output-error (persisted error)', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: {
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'call',
                toolCallId: 'call-2',
                toolName: 'lookup',
                args: { id: 42 },
              },
            },
          ],
        },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts[0]).toEqual({
        type: 'tool-lookup',
        toolCallId: 'call-2',
        state: 'output-error',
        input: { id: 42 },
      });
    });

    it('detects Bun serialization error in result and maps to output-error', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: {
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolCallId: 'call-4',
                toolName: 'searchKnowledge',
                args: { prompt: 'test' },
                result: 'JSON.stringify cannot serialize cyclic structures.',
              },
            },
          ],
        },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts[0]).toEqual({
        type: 'tool-searchKnowledge',
        toolCallId: 'call-4',
        state: 'output-error',
        input: { prompt: 'test' },
      });
    });

    it('detects Node serialization error in result and maps to output-error', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: {
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolCallId: 'call-5',
                toolName: 'lookup',
                args: {},
                result: 'Converting circular structure to JSON -- TypeError',
              },
            },
          ],
        },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts[0].state).toBe('output-error');
    });

    it('uses "unknown" when toolName is missing', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: {
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'call',
                toolCallId: 'call-3',
                args: {},
              },
            },
          ],
        },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts[0].type).toBe('tool-unknown');
    });

    it('passes through non-tool-invocation parts unchanged', async () => {
      const thread = makeThreadRow();
      const textPart = { type: 'text', text: 'hello' };
      const msg = makeMessageRow({
        content: { parts: [textPart] },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts[0]).toEqual(textPart);
    });

    it('passes through non-object parts unchanged', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: { parts: ['just a string', null, 42] },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts).toEqual(['just a string', null, 42]);
    });
  });

  describe('toUIMessage (tested via GET /v1/threads/:threadId)', () => {
    it('falls back to content.content when parts are missing', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        externalId: 'msg-1',
        role: 'assistant',
        content: { content: 'Hello from AI' },
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0]).toMatchObject({
        id: 'msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello from AI' }],
      });
    });

    it('falls back to empty text when both parts and content.content are absent', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({
        content: {},
      });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages[0].parts).toEqual([{ type: 'text', text: '' }]);
    });
  });

  describe('toThreadResponse (tested via all routes)', () => {
    it('exposes externalId as id and excludes internal id', async () => {
      const thread = makeThreadRow({ externalId: 'ext-abc', id: 'internal-xyz' });
      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([{ total: 1 }]));

      const res = await app.request('/v1/threads');
      const body = await res.json();

      expect(body.threads[0].id).toBe('ext-abc');
      expect(body.threads[0]).not.toHaveProperty('internalId');
      // The internal 'id' field should not leak
      expect(body.threads[0].id).not.toBe('internal-xyz');
    });
  });

  // ==========================================================================
  // GET /v1/threads — list
  // ==========================================================================

  describe('GET /v1/threads', () => {
    it('returns paginated thread list with defaults (page=0, perPage=20)', async () => {
      const rows = [makeThreadRow(), makeThreadRow({ externalId: 'ext-thread-2' })];
      mockSelect.mockReturnValueOnce(chainable(rows));
      mockSelect.mockReturnValueOnce(chainable([{ total: 2 }]));

      const res = await app.request('/v1/threads');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(0);
      expect(body.perPage).toBe(20);
      expect(body.hasMore).toBe(false);
    });

    it('respects page and perPage query params', async () => {
      mockSelect.mockReturnValueOnce(chainable([makeThreadRow()]));
      mockSelect.mockReturnValueOnce(chainable([{ total: 50 }]));

      const res = await app.request('/v1/threads?page=1&perPage=10');
      const body = await res.json();

      expect(body.page).toBe(1);
      expect(body.perPage).toBe(10);
      expect(body.hasMore).toBe(true); // 10 + 10 = 20 < 50
    });

    it('returns empty array when user has no threads', async () => {
      mockSelect.mockReturnValueOnce(chainable([]));
      mockSelect.mockReturnValueOnce(chainable([{ total: 0 }]));

      const res = await app.request('/v1/threads');
      const body = await res.json();

      expect(body.threads).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('maps thread rows using toThreadResponse', async () => {
      const row = makeThreadRow({
        id: 'internal-1',
        externalId: 'ext-1',
        resourceId: 'user-1',
        title: 'Chat Title',
        metadata: { tag: 'support' },
      });
      mockSelect.mockReturnValueOnce(chainable([row]));
      mockSelect.mockReturnValueOnce(chainable([{ total: 1 }]));

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
    it('returns thread with messages and calls hydrateChunkSources', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow({ externalId: 'msg-1', role: 'user', content: { content: 'Hi' } });

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));

      const res = await app.request('/v1/threads/ext-thread-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('ext-thread-1');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].id).toBe('msg-1');
      expect(body.messages[0].role).toBe('user');
      expect(mockHydrateChunkSources).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when thread does not exist', async () => {
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/threads/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('returns 404 when thread belongs to a different user', async () => {
      // The where clause filters by both externalId and resourceId,
      // so a thread owned by another user results in empty array
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/threads/other-users-thread');
      expect(res.status).toBe(404);
    });

    it('returns thread with empty messages array when no messages exist', async () => {
      const thread = makeThreadRow();
      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/threads/ext-thread-1');
      const body = await res.json();

      expect(body.messages).toEqual([]);
    });
  });

  // ==========================================================================
  // POST /v1/threads — create
  // ==========================================================================

  describe('POST /v1/threads', () => {
    it('creates a thread and returns 201', async () => {
      const created = makeThreadRow({ title: 'New Chat' });
      const insertChain = chainable([created]);
      mockInsert.mockReturnValue(insertChain);

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
      const created = makeThreadRow({ title: '' });
      const insertChain = chainable([created]);
      mockInsert.mockReturnValue(insertChain);

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
      const created = makeThreadRow({ title: 'With Meta', metadata: meta });
      const insertChain = chainable([created]);
      mockInsert.mockReturnValue(insertChain);

      const res = await app.request('/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'With Meta', metadata: meta }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.metadata).toEqual(meta);
    });

    it('calls db.insert with correct values shape', async () => {
      const created = makeThreadRow();
      const insertChain = chainable([created]);
      mockInsert.mockReturnValue(insertChain);

      await app.request('/v1/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(mockInsert).toHaveBeenCalledTimes(1);
      // Verify values was called on the chain
      expect(insertChain.values).toHaveBeenCalledTimes(1);
      const valuesArg = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        resourceId: 'user-1',
        title: 'Test',
      });
      expect(valuesArg.externalId).toBeDefined();
      expect(valuesArg.createdAt).toBeInstanceOf(Date);
      expect(valuesArg.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // PATCH /v1/threads/:threadId — update
  // ==========================================================================

  describe('PATCH /v1/threads/:threadId', () => {
    it('updates title and returns updated thread', async () => {
      const updated = makeThreadRow({ title: 'Updated Title' });
      const updateChain = chainable([updated]);
      mockUpdate.mockReturnValue(updateChain);

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
      const updated = makeThreadRow({ metadata: newMeta });
      const updateChain = chainable([updated]);
      mockUpdate.mockReturnValue(updateChain);

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
      const updateChain = chainable([]);
      mockUpdate.mockReturnValue(updateChain);

      const res = await app.request('/v1/threads/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('always sets updatedAt in the update payload', async () => {
      const updated = makeThreadRow();
      const updateChain = chainable([updated]);
      mockUpdate.mockReturnValue(updateChain);

      await app.request('/v1/threads/ext-thread-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'X' }),
      });

      expect(updateChain.set).toHaveBeenCalledTimes(1);
      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(setArg.updatedAt).toBeInstanceOf(Date);
      expect(setArg.title).toBe('X');
    });

    it('does not include title in updates when not provided', async () => {
      const updated = makeThreadRow();
      const updateChain = chainable([updated]);
      mockUpdate.mockReturnValue(updateChain);

      await app.request('/v1/threads/ext-thread-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { a: 1 } }),
      });

      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(setArg).not.toHaveProperty('title');
      expect(setArg.metadata).toEqual({ a: 1 });
    });
  });

  // ==========================================================================
  // DELETE /v1/threads/:threadId — delete
  // ==========================================================================

  describe('DELETE /v1/threads/:threadId', () => {
    it('deletes thread and its messages in a transaction', async () => {
      const thread = { id: 'internal-uuid-1' };
      mockSelect.mockReturnValueOnce(chainable([thread]));

      // Mock the transaction to execute the callback
      mockTransaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        const txDeleteChain = chainable(undefined);
        const txDelete = vi.fn().mockReturnValue(txDeleteChain);
        await cb({ delete: txDelete });
        // Verify two deletes happened: messages first, then threads
        expect(txDelete).toHaveBeenCalledTimes(2);
      });

      const res = await app.request('/v1/threads/ext-thread-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when thread does not exist', async () => {
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/threads/nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('returns 404 when thread belongs to different user', async () => {
      // The where clause filters by both externalId and resourceId
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/threads/other-users-thread', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('looks up thread by externalId before deleting', async () => {
      const thread = { id: 'internal-uuid-99' };
      mockSelect.mockReturnValueOnce(chainable([thread]));

      mockTransaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => Promise<void>) => {
        const txDeleteChain = chainable(undefined);
        const txDelete = vi.fn().mockReturnValue(txDeleteChain);
        await cb({ delete: txDelete });
      });

      const res = await app.request('/v1/threads/ext-thread-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      // The select should have been called to find the thread's internal ID
      expect(mockSelect).toHaveBeenCalledTimes(1);
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
