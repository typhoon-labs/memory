import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackService, type FeedbackServiceDeps } from './feedback.service';

function createMockDeps(): FeedbackServiceDeps {
  return {
    feedbackRepo: {
      findByMessageAndUser: vi.fn().mockResolvedValue(null),
      deleteByMessageAndUser: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({ id: 'fb-1', rating: 'positive', comment: null }),
      create: vi.fn().mockResolvedValue({
        id: 'fb-1',
        threadId: 't-1',
        messageId: 'm-1',
        userId: 'u-1',
        rating: 'positive',
        comment: null,
      }),
      listAll: vi.fn().mockResolvedValue([]),
      listByThreadAndUser: vi.fn().mockResolvedValue([]),
    } as unknown as FeedbackServiceDeps['feedbackRepo'],
    messageRepo: {
      findByExternalId: vi.fn().mockResolvedValue(null),
    } as unknown as FeedbackServiceDeps['messageRepo'],
    threadRepo: {
      findByExternalId: vi.fn().mockResolvedValue(null),
    } as unknown as FeedbackServiceDeps['threadRepo'],
  };
}

describe('FeedbackService', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let service: FeedbackService;

  beforeEach(() => {
    deps = createMockDeps();
    service = new FeedbackService(deps);
  });

  describe('upsertFeedback', () => {
    it('returns not-found when message does not exist', async () => {
      const result = await service.upsertFeedback({
        messageExternalId: 'nonexistent',
        userId: 'u-1',
        rating: 'positive',
      });
      expect(result).toEqual({ error: 'not-found' });
    });

    it('deletes feedback when rating is null', async () => {
      vi.mocked(deps.messageRepo.findByExternalId).mockResolvedValue({ id: 'm-1', threadId: 't-1' });

      const result = await service.upsertFeedback({
        messageExternalId: 'msg-ext-1',
        userId: 'u-1',
        rating: null,
      });

      expect(result).toEqual({ data: { deleted: true } });
      expect(deps.feedbackRepo.deleteByMessageAndUser).toHaveBeenCalledWith('m-1', 'u-1');
    });

    it('updates existing feedback', async () => {
      vi.mocked(deps.messageRepo.findByExternalId).mockResolvedValue({ id: 'm-1', threadId: 't-1' });
      vi.mocked(deps.feedbackRepo.findByMessageAndUser).mockResolvedValue({ id: 'fb-existing' } as never);
      vi.mocked(deps.feedbackRepo.update).mockResolvedValue({
        id: 'fb-existing',
        rating: 'negative',
        comment: 'bad',
      } as never);

      const result = await service.upsertFeedback({
        messageExternalId: 'msg-ext-1',
        userId: 'u-1',
        rating: 'negative',
        comment: 'bad',
      });

      expect(result).toEqual({
        data: { id: 'fb-existing', rating: 'negative', comment: 'bad', messageId: 'msg-ext-1' },
      });
      expect(deps.feedbackRepo.update).toHaveBeenCalledWith('fb-existing', { rating: 'negative', comment: 'bad' });
    });

    it('creates new feedback with 201 status marker', async () => {
      vi.mocked(deps.messageRepo.findByExternalId).mockResolvedValue({ id: 'm-1', threadId: 't-1' });
      vi.mocked(deps.feedbackRepo.findByMessageAndUser).mockResolvedValue(null as never);
      vi.mocked(deps.feedbackRepo.create).mockResolvedValue({
        id: 'fb-new',
        threadId: 't-1',
        messageId: 'm-1',
        userId: 'u-1',
        rating: 'positive',
        comment: null,
      } as never);

      const result = await service.upsertFeedback({
        messageExternalId: 'msg-ext-1',
        userId: 'u-1',
        rating: 'positive',
      });

      expect('data' in result && '_status' in (result as { data: Record<string, unknown> }).data).toBe(true);
      expect(deps.feedbackRepo.create).toHaveBeenCalledWith({
        threadId: 't-1',
        messageId: 'm-1',
        userId: 'u-1',
        rating: 'positive',
        comment: null,
      });
    });
  });

  describe('listFeedback', () => {
    it('returns all feedback when no threadExternalId', async () => {
      const entries = [{ id: 'fb-1' }, { id: 'fb-2' }];
      vi.mocked(deps.feedbackRepo.listAll).mockResolvedValue(entries as never);

      const result = await service.listFeedback({ userId: 'u-1' });
      expect(result).toEqual({ data: entries });
    });

    it('returns empty array when thread not found', async () => {
      vi.mocked(deps.threadRepo.findByExternalId).mockResolvedValue(null as never);

      const result = await service.listFeedback({ threadExternalId: 'nonexistent', userId: 'u-1' });
      expect(result).toEqual({ data: [] });
    });

    it('returns thread-scoped feedback with mapped messageId', async () => {
      vi.mocked(deps.threadRepo.findByExternalId).mockResolvedValue({ id: 't-internal' });
      vi.mocked(deps.feedbackRepo.listByThreadAndUser).mockResolvedValue([
        { id: 'fb-1', messageExternalId: 'msg-ext-1', rating: 'positive', comment: null, createdAt: '2025-01-01' },
      ] as never);

      const result = await service.listFeedback({ threadExternalId: 'thread-ext-1', userId: 'u-1' });

      expect(result).toEqual({
        data: [
          {
            id: 'fb-1',
            messageId: 'msg-ext-1',
            messageExternalId: undefined,
            rating: 'positive',
            comment: null,
            createdAt: '2025-01-01',
          },
        ],
      });
      expect(deps.feedbackRepo.listByThreadAndUser).toHaveBeenCalledWith('t-internal', 'u-1');
    });
  });
});
