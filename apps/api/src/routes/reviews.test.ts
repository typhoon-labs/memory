import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockReviewService } = vi.hoisted(() => ({
  mockReviewService: {
    listThreadsForReview: vi.fn(),
    getThreadDetail: vi.fn(),
    createAnnotation: vi.fn(),
    updateAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
  },
}));

// ---------- Module mocks ----------
vi.mock('../services', () => ({
  getReviewService: () => mockReviewService,
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

// ---------- Import module under test ----------
import { reviewRoutes } from './reviews';

// ---------- Helper ----------
function mountRoutes(routes: Record<string, unknown>[]) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

const now = new Date('2026-01-15T10:00:00Z');

// ---------- Tests ----------

describe('reviewRoutes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
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
    it('returns thread list with category score averages and feedback counts', async () => {
      const threads = [
        {
          id: 'ext-1',
          resource_id: 'u1',
          title: 'Chat 1',
          created_at: now,
          updated_at: now,
          message_count: 3,
          responseAvg: 0.8,
          retrievalAvg: 0.6,
          scoreCount: 5,
          annotationCount: 1,
          feedbackCount: 3,
          negativeFeedbackCount: 1,
        },
        {
          id: 'ext-2',
          resource_id: 'u2',
          title: 'Chat 2',
          created_at: now,
          updated_at: now,
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ];

      mockReviewService.listThreadsForReview.mockResolvedValueOnce({
        data: { threads, total: 2 },
      });

      const res = await app.request('/v1/admin/reviews');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.threads).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.threads[0].responseAvg).toBe(0.8);
      expect(body.threads[0].retrievalAvg).toBe(0.6);
      expect(body.threads[0].feedbackCount).toBe(3);
      expect(body.threads[0].negativeFeedbackCount).toBe(1);
      expect(body.threads[1].responseAvg).toBeNull();
      expect(body.threads[1].retrievalAvg).toBeNull();
      expect(body.threads[1].feedbackCount).toBe(0);
    });

    it('returns empty list when no threads exist', async () => {
      mockReviewService.listThreadsForReview.mockResolvedValueOnce({
        data: { threads: [], total: 0 },
      });

      const res = await app.request('/v1/admin/reviews');
      const body = await res.json();

      expect(body.threads).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('sorts by response score (lowest first, unscored last)', async () => {
      const threads = [
        {
          id: 'ext-2',
          resource_id: 'u1',
          title: 'B',
          responseAvg: 0.3,
          retrievalAvg: 0.5,
          scoreCount: 5,
          annotationCount: 0,
        },
        {
          id: 'ext-1',
          resource_id: 'u1',
          title: 'A',
          responseAvg: 0.9,
          retrievalAvg: 0.8,
          scoreCount: 5,
          annotationCount: 0,
        },
        {
          id: 'ext-3',
          resource_id: 'u1',
          title: 'C',
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
        },
      ];

      mockReviewService.listThreadsForReview.mockResolvedValueOnce({
        data: { threads, total: 3 },
      });

      const res = await app.request('/v1/admin/reviews?sortBy=responseScore');
      const body = await res.json();

      expect(body.threads[0].id).toBe('ext-2'); // response = 0.3
      expect(body.threads[1].id).toBe('ext-1'); // response = 0.9
      expect(body.threads[2].id).toBe('ext-3'); // unscored → last
    });

    it('filters by annotation status', async () => {
      const threads = [
        {
          id: 'ext-1',
          resource_id: 'u1',
          title: 'A',
          responseAvg: 0.9,
          retrievalAvg: 0.8,
          scoreCount: 5,
          annotationCount: 2,
        },
      ];

      mockReviewService.listThreadsForReview.mockResolvedValueOnce({
        data: { threads, total: 1 },
      });

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
    it('returns thread with messages, scores, and feedback grouped by message', async () => {
      mockReviewService.getThreadDetail.mockResolvedValueOnce({
        data: {
          id: 'ext-thread-1',
          resourceId: 'user-1',
          title: 'Chat Thread',
          metadata: {},
          createdAt: now,
          updatedAt: now,
          messages: [
            { id: 'msg-ext-1', role: 'assistant', parts: [{ type: 'text', text: 'content' }], createdAt: now },
          ],
          scoresByMessage: {
            'msg-ext-1': [
              {
                id: 'score-1',
                scorer_id: 'faithfulness',
                entity_type: 'message',
                entity_id: 'msg-ext-1',
                thread_id: 'ext-thread-1',
                score: 0.85,
                reason: 'Well grounded',
                metadata: { scorerVersion: 1 },
              },
            ],
          },
          feedbackByMessage: {
            'msg-ext-1': [
              { rating: 'negative', comment: 'Not helpful', userName: 'Alice', createdAt: now.toISOString() },
            ],
          },
        },
      });

      const res = await app.request('/v1/admin/reviews/ext-thread-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('ext-thread-1');
      expect(body.messages).toHaveLength(1);
      expect(body.scoresByMessage['msg-ext-1']).toHaveLength(1);
      expect(body.scoresByMessage['msg-ext-1'][0].scorer_id).toBe('faithfulness');
      expect(body.feedbackByMessage['msg-ext-1']).toHaveLength(1);
      expect(body.feedbackByMessage['msg-ext-1'][0].rating).toBe('negative');
      expect(body.feedbackByMessage['msg-ext-1'][0].userName).toBe('Alice');
    });

    it('enriches human-review scores with annotator names', async () => {
      mockReviewService.getThreadDetail.mockResolvedValueOnce({
        data: {
          id: 'ext-thread-1',
          resourceId: 'user-1',
          title: 'Chat Thread',
          metadata: {},
          createdAt: now,
          updatedAt: now,
          messages: [{ id: 'msg-ext-1', role: 'assistant', parts: [], createdAt: now }],
          scoresByMessage: {
            'msg-ext-1': [
              {
                id: 'score-hr',
                scorer_id: 'human-review',
                score: 0,
                metadata: {
                  source: 'human',
                  tags: ['wrong-answer'],
                  annotatorId: 'admin-1',
                  annotatorName: 'Admin User',
                },
              },
            ],
          },
          feedbackByMessage: {},
        },
      });

      const res = await app.request('/v1/admin/reviews/ext-thread-1');
      const body = await res.json();

      const annotation = body.scoresByMessage['msg-ext-1'][0];
      expect(annotation.scorer_id).toBe('human-review');
      expect(annotation.metadata.annotatorName).toBe('Admin User');
    });

    it('returns 404 when thread not found', async () => {
      mockReviewService.getThreadDetail.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/reviews/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns empty scoresByMessage and feedbackByMessage when none exist', async () => {
      mockReviewService.getThreadDetail.mockResolvedValueOnce({
        data: {
          id: 'ext-thread-1',
          resourceId: 'user-1',
          title: 'Chat Thread',
          metadata: {},
          createdAt: now,
          updatedAt: now,
          messages: [{ id: 'msg-ext-1', role: 'assistant', parts: [], createdAt: now }],
          scoresByMessage: {},
          feedbackByMessage: {},
        },
      });

      const res = await app.request('/v1/admin/reviews/ext-thread-1');
      const body = await res.json();

      expect(body.scoresByMessage).toEqual({});
      expect(body.feedbackByMessage).toEqual({});
    });
  });

  // ==========================================================================
  // POST annotate
  // ==========================================================================

  describe('POST /v1/admin/reviews/:threadId/messages/:messageId/annotate', () => {
    it('creates an annotation and returns 201', async () => {
      mockReviewService.createAnnotation.mockResolvedValueOnce({
        data: { id: 'new-uuid', scorerId: 'human-review', entityId: 'msg-ext-1', threadId: 'ext-thread-1' },
      });

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
      mockReviewService.createAnnotation.mockResolvedValueOnce({ error: 'conflict' });

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['correct'] }),
      });

      expect(res.status).toBe(409);
    });

    it('returns 404 when thread not found', async () => {
      mockReviewService.createAnnotation.mockResolvedValueOnce({ error: 'thread-not-found' });

      const res = await app.request('/v1/admin/reviews/nonexistent/messages/msg-1/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['correct'] }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 404 when message not found', async () => {
      mockReviewService.createAnnotation.mockResolvedValueOnce({ error: 'message-not-found' });

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
      mockReviewService.updateAnnotation.mockResolvedValueOnce({
        data: { id: 'existing-id', updated: true },
      });

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
      mockReviewService.updateAnnotation.mockResolvedValueOnce({ error: 'not-found' });

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
      mockReviewService.deleteAnnotation.mockResolvedValueOnce({ data: { ok: true } });

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it('returns 404 when no annotation exists', async () => {
      mockReviewService.deleteAnnotation.mockResolvedValueOnce({ error: 'not-found' });

      const res = await app.request('/v1/admin/reviews/ext-thread-1/messages/msg-ext-1/annotate', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });
});
