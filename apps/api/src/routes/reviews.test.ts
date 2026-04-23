import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainable } from '../../../../tests/helpers/api-test-utils';

// ---------- Hoisted mocks ----------
const { mockSelect, mockSqlUnsafe, mockHydrateChunkSources } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockSqlUnsafe: vi.fn().mockResolvedValue([]),
  mockHydrateChunkSources: vi.fn().mockResolvedValue(undefined),
}));

// ---------- Module mocks ----------
vi.mock('../db', () => ({
  db: { select: mockSelect },
  sql: { unsafe: mockSqlUnsafe },
}));

vi.mock('./hydrate-chunks', () => ({
  hydrateChunkSources: mockHydrateChunkSources,
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class MockPgVector {},
}));

const mockAdminUser = { id: 'admin-1', email: 'admin@test.example', role: APP_ROLES.ADMIN };

vi.mock('../middleware/require-auth', () => ({
  requireAuth: createMiddleware(async (c, next) => {
    c.set('user' as never, mockAdminUser);
    await next();
  }),
}));

vi.mock('../middleware/require-admin', () => ({
  requireAdmin: createMiddleware(async (_c, next) => {
    await next();
  }),
}));

vi.mock('./threads', () => ({
  toUIMessage: (msg: Record<string, unknown>) => ({
    id: msg.externalId,
    role: msg.role,
    parts: [{ type: 'text', text: 'content' }],
    createdAt: msg.createdAt,
  }),
  toThreadResponse: (row: Record<string, unknown>) => ({
    id: row.externalId,
    resourceId: row.resourceId,
    title: row.title,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
}));

// ---------- Import module under test ----------
import { reviewRoutes } from './reviews';

// ---------- Helper ----------
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

const now = new Date('2026-01-15T10:00:00Z');

function makeThreadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'internal-uuid-1',
    externalId: 'ext-thread-1',
    resourceId: 'user-1',
    title: 'Chat Thread',
    metadata: {},
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
    role: 'assistant',
    type: 'text',
    content: { content: 'Answer' },
    createdAt: now,
    ...overrides,
  };
}

function makeScoreRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'score-1',
    scorer_id: 'faithfulness',
    entity_type: 'message',
    entity_id: 'msg-ext-1',
    thread_id: 'ext-thread-1',
    score: 0.85,
    reason: 'Well grounded',
    metadata: { scorerVersion: 1 },
    resource_id: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

// ---------- Tests ----------

describe('reviewRoutes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: mockSqlUnsafe resolves to empty array
    mockSqlUnsafe.mockResolvedValue([]);
    app = mountRoutes(reviewRoutes as unknown as Record<string, unknown>[]);
  });

  // ==========================================================================
  // Route structure
  // ==========================================================================

  describe('route structure', () => {
    it('exports five routes', () => {
      expect(reviewRoutes).toHaveLength(5);
    });

    it('all routes use requireAuth and requireAdmin middleware', () => {
      for (const route of reviewRoutes as unknown as Record<string, unknown>[]) {
        const mid = Array.isArray(route.middleware) ? route.middleware : [route.middleware];
        expect(mid.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('defines correct HTTP methods and paths', () => {
      const routes = reviewRoutes as unknown as { path: string; method: string }[];
      const specs = routes.map((r) => ({ path: r.path, method: r.method }));

      expect(specs).toContainEqual({ path: '/v1/admin/reviews', method: 'GET' });
      expect(specs).toContainEqual({ path: '/v1/admin/reviews/:threadId', method: 'GET' });
      expect(specs).toContainEqual({
        path: '/v1/admin/reviews/:threadId/messages/:messageId/annotate',
        method: 'POST',
      });
      expect(specs).toContainEqual({
        path: '/v1/admin/reviews/:threadId/messages/:messageId/annotate',
        method: 'PATCH',
      });
      expect(specs).toContainEqual({
        path: '/v1/admin/reviews/:threadId/messages/:messageId/annotate',
        method: 'DELETE',
      });
    });
  });

  // ==========================================================================
  // GET /v1/admin/reviews — list
  // ==========================================================================

  describe('GET /v1/admin/reviews', () => {
    it('returns paginated thread list with score aggregates', async () => {
      const threads = [
        { id: 'ext-1', resource_id: 'u1', title: 'Chat 1', created_at: now, updated_at: now, message_count: 3 },
        { id: 'ext-2', resource_id: 'u2', title: 'Chat 2', created_at: now, updated_at: now, message_count: 1 },
      ];
      const aggregates = [{ thread_id: 'ext-1', avg_score: 0.8, min_score: 0.6, score_count: 5, annotation_count: 1 }];

      // First call: thread list, second call: aggregates
      mockSqlUnsafe.mockResolvedValueOnce(threads).mockResolvedValueOnce(aggregates);

      const res = await app.request('/v1/admin/reviews?page=0&perPage=20');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.threads[0].avgScore).toBe(0.8);
      expect(body.threads[1].avgScore).toBeNull();
    });

    it('returns empty list when no threads exist', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews');
      const body = await res.json();

      expect(body.threads).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('sorts by worst score (lowest first, unscored last)', async () => {
      const threads = [
        { id: 'ext-1', resource_id: 'u1', title: 'A', created_at: now, updated_at: now, message_count: 1 },
        { id: 'ext-2', resource_id: 'u1', title: 'B', created_at: now, updated_at: now, message_count: 1 },
        { id: 'ext-3', resource_id: 'u1', title: 'C', created_at: now, updated_at: now, message_count: 1 },
      ];
      const aggregates = [
        { thread_id: 'ext-1', avg_score: 0.9, min_score: 0.8, score_count: 5, annotation_count: 0 },
        { thread_id: 'ext-2', avg_score: 0.3, min_score: 0.1, score_count: 5, annotation_count: 0 },
      ];

      mockSqlUnsafe.mockResolvedValueOnce(threads).mockResolvedValueOnce(aggregates);

      const res = await app.request('/v1/admin/reviews?sortBy=worstScore');
      const body = await res.json();

      expect(body.threads[0].id).toBe('ext-2'); // worst = 0.1
      expect(body.threads[1].id).toBe('ext-1'); // worst = 0.8
      expect(body.threads[2].id).toBe('ext-3'); // unscored → last
    });

    it('filters by annotation status', async () => {
      const threads = [
        { id: 'ext-1', resource_id: 'u1', title: 'A', created_at: now, updated_at: now, message_count: 1 },
        { id: 'ext-2', resource_id: 'u1', title: 'B', created_at: now, updated_at: now, message_count: 1 },
      ];
      const aggregates = [
        { thread_id: 'ext-1', avg_score: 0.9, min_score: 0.8, score_count: 5, annotation_count: 2 },
        { thread_id: 'ext-2', avg_score: 0.5, min_score: 0.3, score_count: 5, annotation_count: 0 },
      ];

      mockSqlUnsafe.mockResolvedValueOnce(threads).mockResolvedValueOnce(aggregates);

      const res = await app.request('/v1/admin/reviews?annotationStatus=annotated');
      const body = await res.json();

      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].id).toBe('ext-1');
    });
  });

  // ==========================================================================
  // GET /v1/admin/reviews/:threadId — detail
  // ==========================================================================

  describe('GET /v1/admin/reviews/:threadId', () => {
    it('returns thread with messages and scores grouped by message', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow();
      const scores = [makeScoreRow()];

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));
      mockSqlUnsafe.mockResolvedValueOnce(scores);

      const res = await app.request('/v1/admin/reviews/ext-thread-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('ext-thread-1');
      expect(body.messages).toHaveLength(1);
      expect(body.scoresByMessage['msg-ext-1']).toHaveLength(1);
      expect(body.scoresByMessage['msg-ext-1'][0].scorer_id).toBe('faithfulness');
      expect(mockHydrateChunkSources).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when thread not found', async () => {
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/admin/reviews/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns empty scoresByMessage when no scores exist', async () => {
      const thread = makeThreadRow();
      const msg = makeMessageRow();

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));
      mockSqlUnsafe.mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1');
      const body = await res.json();

      expect(body.scoresByMessage).toEqual({});
    });
  });

  // ==========================================================================
  // POST annotate
  // ==========================================================================

  describe('POST /v1/admin/reviews/:threadId/messages/:messageId/annotate', () => {
    it('creates an annotation and returns 201', async () => {
      const thread = { id: 'internal-uuid-1' };
      const msg = { id: 'msg-internal-1' };

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));
      // Check existing annotation (none), then INSERT
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['hallucination'], severity: 'major', comment: 'Made up info' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.scorerId).toBe('human-review');
      expect(body.entityId).toBe('msg-ext-1');
    });

    it('returns 409 when annotation already exists', async () => {
      const thread = { id: 'internal-uuid-1' };
      const msg = { id: 'msg-internal-1' };

      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([msg]));
      mockSqlUnsafe.mockResolvedValueOnce([{ id: 'existing-annotation-id' }]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['correct'] }),
      });

      expect(res.status).toBe(409);
    });

    it('returns 404 when thread not found', async () => {
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/admin/reviews/nonexistent/messages/msg-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['correct'] }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 404 when message not found', async () => {
      const thread = { id: 'internal-uuid-1' };
      mockSelect.mockReturnValueOnce(chainable([thread]));
      mockSelect.mockReturnValueOnce(chainable([]));

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/nonexistent/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['wrong-answer'] }),
      });

      expect(res.status).toBe(404);
    });

    it('rejects invalid tags with error response', async () => {
      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['invalid-tag'] }),
      });

      // Zod parse failure is an unhandled throw → 500
      expect(res.ok).toBe(false);
    });

    it('rejects empty tags array with error response', async () => {
      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [] }),
      });

      expect(res.ok).toBe(false);
    });
  });

  // ==========================================================================
  // PATCH annotate
  // ==========================================================================

  describe('PATCH /v1/admin/reviews/:threadId/messages/:messageId/annotate', () => {
    it('updates an existing annotation', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([{ id: 'existing-id' }]).mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['correct'], comment: 'Looks good now' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.updated).toBe(true);
    });

    it('returns 404 when no existing annotation', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['correct'] }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE annotate
  // ==========================================================================

  describe('DELETE /v1/admin/reviews/:threadId/messages/:messageId/annotate', () => {
    it('deletes an annotation', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([{ id: 'existing-id' }]).mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('returns 404 when no annotation exists', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
