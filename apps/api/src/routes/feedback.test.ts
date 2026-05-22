import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => {
  /**
   * Builds a chainable drizzle query mock that resolves to `result`.
   * The chain is thenable: `await chain` resolves to `result`, and every
   * method returns the same chain so `.set().where().returning()` works.
   */
  function makeChain(result: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const self = () => chain;
    chain.from = vi.fn(self);
    chain.where = vi.fn(self);
    chain.innerJoin = vi.fn(self);
    chain.values = vi.fn(self);
    chain.set = vi.fn(self);
    chain.returning = vi.fn().mockResolvedValue(result);
    // Make the chain itself awaitable (for queries without .returning()).
    // oxlint-disable-next-line unicorn/no-thenable -- drizzle query builders are thenable
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  return {
    makeChain,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
});

vi.mock('../infra/db', () => ({ db: mockDb, sql: {} }));

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class MockPgVector {},
}));

vi.mock('@typhoon/db', () => ({
  messages: { id: 'messages.id', externalId: 'messages.externalId', threadId: 'messages.threadId' },
  feedback: {
    id: 'feedback.id',
    messageId: 'feedback.messageId',
    userId: 'feedback.userId',
    threadId: 'feedback.threadId',
    rating: 'feedback.rating',
    comment: 'feedback.comment',
    createdAt: 'feedback.createdAt',
  },
  threads: { id: 'threads.id', externalId: 'threads.externalId' },
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('user' as never, { id: 'user-1' });
    await next();
  }),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { feedbackRoutes } from './feedback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mount the exported route descriptors onto a real Hono app for testing. */
function mountRoutes(routes: Array<Record<string, unknown>>) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[String(route.method).toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = mountRoutes(feedbackRoutes as any);
});

// ---------------------------------------------------------------------------
// POST /v1/feedback
// ---------------------------------------------------------------------------

describe('POST /v1/feedback', () => {
  it('creates new positive feedback and returns 201', async () => {
    const insertedRow = {
      id: 'fb-1',
      threadId: 'thread-int',
      messageId: 'msg-int',
      userId: 'user-1',
      rating: 'positive',
      comment: null,
      createdAt: new Date().toISOString(),
    };

    // message lookup
    const msgChain = mockDb.makeChain([{ id: 'msg-int', threadId: 'thread-int' }]);
    mockDb.select.mockReturnValueOnce(msgChain);

    // existing feedback lookup → empty
    const existChain = mockDb.makeChain([]);
    mockDb.select.mockReturnValueOnce(existChain);

    // insert
    const insertChain = mockDb.makeChain([insertedRow]);
    mockDb.insert.mockReturnValueOnce(insertChain);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: 'ext-msg-1', rating: 'positive' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ id: 'fb-1', rating: 'positive', messageId: 'ext-msg-1' });
  });

  it('creates new negative feedback with a comment and returns 201', async () => {
    const insertedRow = {
      id: 'fb-2',
      threadId: 'thread-int',
      messageId: 'msg-int',
      userId: 'user-1',
      rating: 'negative',
      comment: 'Not helpful',
      createdAt: new Date().toISOString(),
    };

    const msgChain = mockDb.makeChain([{ id: 'msg-int', threadId: 'thread-int' }]);
    mockDb.select.mockReturnValueOnce(msgChain);

    const existChain = mockDb.makeChain([]);
    mockDb.select.mockReturnValueOnce(existChain);

    const insertChain = mockDb.makeChain([insertedRow]);
    mockDb.insert.mockReturnValueOnce(insertChain);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: 'ext-msg-2', rating: 'negative', comment: 'Not helpful' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ rating: 'negative', comment: 'Not helpful', messageId: 'ext-msg-2' });
  });

  it('updates existing feedback and returns 200', async () => {
    const updatedRow = {
      id: 'fb-existing',
      threadId: 'thread-int',
      messageId: 'msg-int',
      userId: 'user-1',
      rating: 'negative',
      comment: 'Changed my mind',
      createdAt: new Date().toISOString(),
    };

    // message lookup
    const msgChain = mockDb.makeChain([{ id: 'msg-int', threadId: 'thread-int' }]);
    mockDb.select.mockReturnValueOnce(msgChain);

    // existing feedback lookup → found
    const existChain = mockDb.makeChain([{ id: 'fb-existing' }]);
    mockDb.select.mockReturnValueOnce(existChain);

    // update
    const updateChain = mockDb.makeChain([updatedRow]);
    mockDb.update.mockReturnValueOnce(updateChain);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: 'ext-msg-1', rating: 'negative', comment: 'Changed my mind' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ id: 'fb-existing', rating: 'negative', messageId: 'ext-msg-1' });
  });

  it('deletes feedback when rating is null and returns { deleted: true }', async () => {
    // message lookup
    const msgChain = mockDb.makeChain([{ id: 'msg-int', threadId: 'thread-int' }]);
    mockDb.select.mockReturnValueOnce(msgChain);

    // delete
    const delChain = mockDb.makeChain([]);
    mockDb.delete.mockReturnValueOnce(delChain);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: 'ext-msg-1', rating: null }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: true });
  });

  it('returns 404 when messageId is not found', async () => {
    // message lookup → empty
    const msgChain = mockDb.makeChain([]);
    mockDb.select.mockReturnValueOnce(msgChain);

    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: 'nonexistent', rating: 'positive' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
  });

  it('rejects request with missing messageId (Zod validation)', async () => {
    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 'positive' }),
    });

    // Zod parse throws → Hono returns 500 by default
    expect(res.status).toBe(500);
  });

  it('rejects request with empty messageId (Zod validation)', async () => {
    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: '', rating: 'positive' }),
    });

    expect(res.status).toBe(500);
  });

  it('rejects request with invalid rating value (Zod validation)', async () => {
    const res = await app.request('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: 'msg-1', rating: 'neutral' }),
    });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/feedback
// ---------------------------------------------------------------------------

describe('GET /v1/feedback', () => {
  it('returns all feedback when threadId query is absent (admin path)', async () => {
    const allFeedback = [
      { id: 'fb-1', rating: 'positive', comment: null },
      { id: 'fb-2', rating: 'negative', comment: 'Bad' },
    ];

    const selectChain = mockDb.makeChain(allFeedback);
    mockDb.select.mockReturnValueOnce(selectChain);

    const res = await app.request('/v1/feedback', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(allFeedback);
  });

  it('returns user-scoped feedback with mapped messageId when threadId is provided', async () => {
    // thread lookup
    const threadChain = mockDb.makeChain([{ id: 'thread-int' }]);
    mockDb.select.mockReturnValueOnce(threadChain);

    // feedback query with join
    const feedbackRows = [
      {
        id: 'fb-10',
        messageExternalId: 'ext-msg-A',
        rating: 'positive',
        comment: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'fb-11',
        messageExternalId: 'ext-msg-B',
        rating: 'negative',
        comment: 'Needs improvement',
        createdAt: '2026-01-02T00:00:00Z',
      },
    ];
    const fbChain = mockDb.makeChain(feedbackRows);
    mockDb.select.mockReturnValueOnce(fbChain);

    const res = await app.request('/v1/feedback?threadId=ext-thread-1', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();

    // messageExternalId should be mapped to messageId and the original key removed
    expect(json).toEqual([
      {
        id: 'fb-10',
        messageId: 'ext-msg-A',
        rating: 'positive',
        comment: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'fb-11',
        messageId: 'ext-msg-B',
        rating: 'negative',
        comment: 'Needs improvement',
        createdAt: '2026-01-02T00:00:00Z',
      },
    ]);
  });

  it('returns empty array when thread is not found', async () => {
    // thread lookup → empty
    const threadChain = mockDb.makeChain([]);
    mockDb.select.mockReturnValueOnce(threadChain);

    const res = await app.request('/v1/feedback?threadId=nonexistent', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});
