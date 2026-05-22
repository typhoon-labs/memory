import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import type { ReviewServiceDeps } from './review.service';
import { ReviewService } from './review.service';

vi.mock('../threads/hydrate-chunks', () => ({
  hydrateChunkSources: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../threads/thread.service', () => ({
  isSystemReminder: vi.fn((msg: Record<string, unknown>) => {
    const content = msg.content as Record<string, unknown> | undefined;
    return !!content?.metadata && !!(content.metadata as Record<string, unknown>).systemReminder;
  }),
  toUIMessage: vi.fn((msg: Record<string, unknown>) => ({
    id: msg.externalId,
    role: msg.role,
    parts: [{ type: 'text', text: 'message' }],
    createdAt: msg.createdAt,
  })),
  toThreadResponse: vi.fn((thread: Record<string, unknown>) => ({
    id: thread.externalId,
    resourceId: thread.resourceId,
    title: thread.title,
    metadata: thread.metadata,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<ReviewServiceDeps> = {}): ReviewServiceDeps {
  return {
    reviewRepo: {
      listThreadsWithMessageCounts: vi.fn().mockResolvedValue([]),
      getScoreAggregates: vi.fn().mockResolvedValue([]),
      getFeedbackCounts: vi.fn().mockResolvedValue([]),
      findThreadByExternalId: vi.fn().mockResolvedValue(null),
      listMessagesByThreadId: vi.fn().mockResolvedValue([]),
      getThreadScores: vi.fn().mockResolvedValue([]),
      getAnnotatorNames: vi.fn().mockResolvedValue(new Map()),
      getThreadFeedback: vi.fn().mockResolvedValue([]),
      findMessageInThread: vi.fn().mockResolvedValue(null),
      findAnnotation: vi.fn().mockResolvedValue(null),
      createAnnotation: vi.fn().mockResolvedValue(undefined),
      updateAnnotation: vi.fn().mockResolvedValue(undefined),
      deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReviewServiceDeps['reviewRepo'],
    vectorStore: {
      getChunksByIds: vi.fn().mockResolvedValue([]),
      getSyncTargetNames: vi.fn().mockResolvedValue(new Map()),
    } as unknown as ReviewServiceDeps['vectorStore'],
    ...overrides,
  };
}

const now = new Date('2026-01-15T10:00:00Z');

function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'internal-1',
    externalId: 'ext-thread-1',
    resourceId: 'user-1',
    title: 'Chat Thread',
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ReviewService', () => {
  let deps: ReviewServiceDeps;
  let service: ReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new ReviewService(deps);
  });

  describe('listThreadsForReview', () => {
    it('returns merged threads with scores and feedback', async () => {
      vi.mocked(deps.reviewRepo.listThreadsWithMessageCounts).mockResolvedValueOnce([
        { id: 't-1', externalId: 'ext-1', title: 'Thread 1' },
        { id: 't-2', externalId: 'ext-2', title: 'Thread 2' },
      ] as never);
      vi.mocked(deps.reviewRepo.getScoreAggregates).mockResolvedValueOnce([
        { thread_id: 't-1', response_avg: 0.9, retrieval_avg: 0.8, score_count: 5, annotation_count: 1 },
      ] as never);
      vi.mocked(deps.reviewRepo.getFeedbackCounts).mockResolvedValueOnce([
        { thread_id: 't-1', feedback_count: 3, negative_feedback_count: 1 },
      ] as never);

      const result = await service.listThreadsForReview({});
      const data = assertOk(result);
      expect(data.threads).toHaveLength(2);
      expect(data.total).toBe(2);
      // t-1 has aggregates
      expect(data.threads[0]).toMatchObject({ id: 't-1', responseAvg: 0.9, feedbackCount: 3 });
      // t-2 has defaults
      expect(data.threads[1]).toMatchObject({ id: 't-2', responseAvg: null, feedbackCount: 0 });
    });

    it('filters by annotated status', async () => {
      vi.mocked(deps.reviewRepo.listThreadsWithMessageCounts).mockResolvedValueOnce([
        { id: 't-1' },
        { id: 't-2' },
      ] as never);
      vi.mocked(deps.reviewRepo.getScoreAggregates).mockResolvedValueOnce([
        { thread_id: 't-1', response_avg: 0.8, retrieval_avg: null, score_count: 3, annotation_count: 2 },
        { thread_id: 't-2', response_avg: 0.7, retrieval_avg: null, score_count: 1, annotation_count: 0 },
      ] as never);
      vi.mocked(deps.reviewRepo.getFeedbackCounts).mockResolvedValueOnce([] as never);

      const result = await service.listThreadsForReview({ annotationStatus: 'annotated' });
      const data = assertOk(result);
      expect(data.threads).toHaveLength(1);
      expect(data.threads[0]).toMatchObject({ id: 't-1' });
    });

    it('filters by unannotated status', async () => {
      vi.mocked(deps.reviewRepo.listThreadsWithMessageCounts).mockResolvedValueOnce([
        { id: 't-1' },
        { id: 't-2' },
      ] as never);
      vi.mocked(deps.reviewRepo.getScoreAggregates).mockResolvedValueOnce([
        { thread_id: 't-1', response_avg: 0.8, retrieval_avg: null, score_count: 3, annotation_count: 2 },
      ] as never);
      vi.mocked(deps.reviewRepo.getFeedbackCounts).mockResolvedValueOnce([] as never);

      const result = await service.listThreadsForReview({ annotationStatus: 'unannotated' });
      const data = assertOk(result);
      expect(data.threads).toHaveLength(1);
      expect(data.threads[0]).toMatchObject({ id: 't-2' });
    });

    it('sorts by responseScore ascending', async () => {
      vi.mocked(deps.reviewRepo.listThreadsWithMessageCounts).mockResolvedValueOnce([
        { id: 't-1' },
        { id: 't-2' },
        { id: 't-3' },
      ] as never);
      vi.mocked(deps.reviewRepo.getScoreAggregates).mockResolvedValueOnce([
        { thread_id: 't-1', response_avg: 0.9, retrieval_avg: null, score_count: 3, annotation_count: 0 },
        { thread_id: 't-2', response_avg: 0.3, retrieval_avg: null, score_count: 2, annotation_count: 0 },
        { thread_id: 't-3', response_avg: null, retrieval_avg: null, score_count: 0, annotation_count: 0 },
      ] as never);
      vi.mocked(deps.reviewRepo.getFeedbackCounts).mockResolvedValueOnce([] as never);

      const result = await service.listThreadsForReview({ sortBy: 'responseScore' });
      const data = assertOk(result);
      const ids = data.threads.map((t) => t.id);
      expect(ids).toEqual(['t-2', 't-1', 't-3']); // lowest first, null last
    });

    it('sorts by unscored (ascending score count)', async () => {
      vi.mocked(deps.reviewRepo.listThreadsWithMessageCounts).mockResolvedValueOnce([
        { id: 't-1' },
        { id: 't-2' },
      ] as never);
      vi.mocked(deps.reviewRepo.getScoreAggregates).mockResolvedValueOnce([
        { thread_id: 't-1', response_avg: 0.9, retrieval_avg: null, score_count: 10, annotation_count: 0 },
        { thread_id: 't-2', response_avg: 0.5, retrieval_avg: null, score_count: 1, annotation_count: 0 },
      ] as never);
      vi.mocked(deps.reviewRepo.getFeedbackCounts).mockResolvedValueOnce([] as never);

      const result = await service.listThreadsForReview({ sortBy: 'unscored' });
      const data = assertOk(result);
      expect(data.threads[0]).toMatchObject({ id: 't-2', scoreCount: 1 });
    });
  });

  describe('getThreadDetail', () => {
    it('returns thread detail with messages, scores, and feedback', async () => {
      const thread = makeThread();
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(thread as never);
      vi.mocked(deps.reviewRepo.listMessagesByThreadId).mockResolvedValueOnce([
        { externalId: 'msg-1', role: 'user', content: { content: 'Hello' }, createdAt: now },
        { externalId: 'msg-2', role: 'assistant', content: { content: 'Hi' }, createdAt: now },
      ] as never);
      vi.mocked(deps.reviewRepo.getThreadScores).mockResolvedValueOnce([
        { entity_id: 'msg-2', scorer_id: 'tone', score: 0.9, metadata: null },
      ] as never);
      vi.mocked(deps.reviewRepo.getAnnotatorNames).mockResolvedValueOnce(new Map() as never);
      vi.mocked(deps.reviewRepo.getThreadFeedback).mockResolvedValueOnce([
        {
          message_external_id: 'msg-2',
          rating: 'positive',
          comment: 'Great!',
          user_name: 'Alice',
          created_at: '2026-01-15',
        },
      ] as never);

      const result = await service.getThreadDetail('ext-thread-1');
      const data = assertOk(result);
      expect(data.id).toBe('ext-thread-1');
      expect(data.messages).toHaveLength(2);
      expect(data.scoresByMessage['msg-2']).toHaveLength(1);
      expect(data.feedbackByMessage['msg-2']).toHaveLength(1);
      expect(data.feedbackByMessage['msg-2'][0]).toMatchObject({ rating: 'positive' });
    });

    it('returns not-found when thread does not exist', async () => {
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(null as never);
      const result = await service.getThreadDetail('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('enriches human-review scores with annotator names', async () => {
      const thread = makeThread();
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(thread as never);
      vi.mocked(deps.reviewRepo.listMessagesByThreadId).mockResolvedValueOnce([] as never);
      vi.mocked(deps.reviewRepo.getThreadScores).mockResolvedValueOnce([
        {
          entity_id: 'msg-1',
          scorer_id: 'human-review',
          score: 0.0,
          metadata: { annotatorId: 'user-42', tags: ['incorrect'] },
        },
      ] as never);
      vi.mocked(deps.reviewRepo.getAnnotatorNames).mockResolvedValueOnce(
        new Map([['user-42', 'Alice Admin']]) as never,
      );
      vi.mocked(deps.reviewRepo.getThreadFeedback).mockResolvedValueOnce([] as never);

      const result = await service.getThreadDetail('ext-thread-1');
      const data = assertOk(result);
      const scores = data.scoresByMessage['msg-1'];
      expect(scores).toHaveLength(1);
      expect((scores[0].metadata as Record<string, unknown>).annotatorName).toBe('Alice Admin');
    });
  });

  describe('createAnnotation', () => {
    it('creates annotation and returns result', async () => {
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(makeThread() as never);
      vi.mocked(deps.reviewRepo.findMessageInThread).mockResolvedValueOnce({ id: 'msg-internal' } as never);
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce(null as never);

      const result = await service.createAnnotation({
        threadId: 'ext-thread-1',
        messageId: 'msg-1',
        userId: 'user-1',
        tags: ['correct'],
      });

      const data = assertOk(result);
      expect(data.scorerId).toBe('human-review');
      expect(data.entityId).toBe('msg-1');
      expect(deps.reviewRepo.createAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          score: 1.0,
          metadata: expect.objectContaining({ tags: ['correct'] }),
        }),
      );
    });

    it('sets score to 0 when tags do not include correct', async () => {
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(makeThread() as never);
      vi.mocked(deps.reviewRepo.findMessageInThread).mockResolvedValueOnce({ id: 'msg-internal' } as never);
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce(null as never);

      await service.createAnnotation({
        threadId: 'ext-thread-1',
        messageId: 'msg-1',
        userId: 'user-1',
        tags: ['hallucination', 'off-topic'],
      });

      expect(deps.reviewRepo.createAnnotation).toHaveBeenCalledWith(expect.objectContaining({ score: 0.0 }));
    });

    it('returns thread-not-found when thread does not exist', async () => {
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(null as never);
      const result = await service.createAnnotation({
        threadId: 'nonexistent',
        messageId: 'msg-1',
        userId: 'user-1',
        tags: [],
      });
      const error = assertErr(result);
      expect(error).toBe('thread-not-found');
    });

    it('returns message-not-found when message is not in thread', async () => {
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(makeThread() as never);
      vi.mocked(deps.reviewRepo.findMessageInThread).mockResolvedValueOnce(null as never);

      const result = await service.createAnnotation({
        threadId: 'ext-thread-1',
        messageId: 'wrong-msg',
        userId: 'user-1',
        tags: [],
      });
      const error = assertErr(result);
      expect(error).toBe('message-not-found');
    });

    it('returns conflict when annotation already exists', async () => {
      vi.mocked(deps.reviewRepo.findThreadByExternalId).mockResolvedValueOnce(makeThread() as never);
      vi.mocked(deps.reviewRepo.findMessageInThread).mockResolvedValueOnce({ id: 'msg-internal' } as never);
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce({ id: 'existing' } as never);

      const result = await service.createAnnotation({
        threadId: 'ext-thread-1',
        messageId: 'msg-1',
        userId: 'user-1',
        tags: ['correct'],
      });
      const error = assertErr(result);
      expect(error).toBe('conflict');
    });
  });

  describe('updateAnnotation', () => {
    it('updates existing annotation', async () => {
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce({ id: 'ann-1' } as never);

      const result = await service.updateAnnotation({
        messageId: 'msg-1',
        userId: 'user-1',
        tags: ['correct'],
        comment: 'Updated comment',
      });

      const data = assertOk(result);
      expect(data).toEqual({ id: 'ann-1', updated: true });
      expect(deps.reviewRepo.updateAnnotation).toHaveBeenCalledWith('ann-1', {
        score: 1.0,
        comment: 'Updated comment',
        metadata: expect.objectContaining({ tags: ['correct'] }),
      });
    });

    it('returns not-found when annotation does not exist', async () => {
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce(null as never);
      const result = await service.updateAnnotation({
        messageId: 'msg-1',
        userId: 'user-1',
        tags: [],
      });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('deleteAnnotation', () => {
    it('deletes existing annotation', async () => {
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce({ id: 'ann-1' } as never);

      const result = await service.deleteAnnotation({ messageId: 'msg-1', userId: 'user-1' });
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.reviewRepo.deleteAnnotation).toHaveBeenCalledWith('ann-1');
    });

    it('returns not-found when annotation does not exist', async () => {
      vi.mocked(deps.reviewRepo.findAnnotation).mockResolvedValueOnce(null as never);
      const result = await service.deleteAnnotation({ messageId: 'msg-1', userId: 'user-1' });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });
});
