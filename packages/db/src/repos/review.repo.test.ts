import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewRepo } from './review.repo';

function createMockDb() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const makeChain = (): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get(_, prop) {
        if (prop === 'then') return undefined;
        chain[prop as string] ??= vi.fn().mockReturnValue(makeChain());
        return chain[prop as string];
      },
    });

  const db = {
    select: vi.fn().mockReturnValue(makeChain()),
    execute: vi.fn().mockResolvedValue([]),
    _chain: chain,
  };

  return db;
}

describe('ReviewRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: ReviewRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new ReviewRepo(db as any);
  });

  describe('listThreadsWithMessageCounts', () => {
    it('calls db.execute and returns rows', async () => {
      const rows = [{ id: 'ext-1', resource_id: 'user-1', message_count: 5 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.listThreadsWithMessageCounts();
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getScoreAggregates', () => {
    it('returns empty array for empty threadIds', async () => {
      const result = await repo.getScoreAggregates([]);
      expect(result).toEqual([]);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns score aggregates', async () => {
      const rows = [{ thread_id: 'ext-1', response_avg: 0.8, retrieval_avg: 0.9, score_count: 3, annotation_count: 1 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getScoreAggregates(['ext-1']);
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFeedbackCounts', () => {
    it('returns empty array for empty threadIds', async () => {
      const result = await repo.getFeedbackCounts([]);
      expect(result).toEqual([]);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns feedback counts', async () => {
      const rows = [{ thread_id: 'ext-1', feedback_count: 10, negative_feedback_count: 2 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getFeedbackCounts(['ext-1']);
      expect(result).toEqual(rows);
    });
  });

  describe('findThreadByExternalId', () => {
    it('returns thread when found', async () => {
      const thread = { id: 'int-1', externalId: 'ext-1' };
      db._chain.where = vi.fn().mockResolvedValue([thread]);

      const result = await repo.findThreadByExternalId('ext-1');
      expect(result).toEqual(thread);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findThreadByExternalId('missing');
      expect(result).toBeNull();
    });
  });

  describe('listMessagesByThreadId', () => {
    it('returns ordered messages', async () => {
      const msgs = [{ id: 'm-1' }, { id: 'm-2' }];
      db._chain.orderBy = vi.fn().mockResolvedValue(msgs);

      const result = await repo.listMessagesByThreadId('int-1');
      expect(result).toEqual(msgs);
    });
  });

  describe('getThreadScores', () => {
    it('returns scores for a thread', async () => {
      const rows = [{ id: 's-1', scorer_id: 'faithfulness', score: 0.9 }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getThreadScores('ext-1');
      expect(result).toEqual(rows);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAnnotatorNames', () => {
    it('returns empty map for empty input', async () => {
      const result = await repo.getAnnotatorNames([]);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('returns map of id to name', async () => {
      db.execute.mockResolvedValue([{ id: 'u-1', name: 'Alice' }]);

      const result = await repo.getAnnotatorNames(['u-1']);
      expect(result.get('u-1')).toBe('Alice');
    });
  });

  describe('getThreadFeedback', () => {
    it('returns feedback rows', async () => {
      const rows = [{ rating: 'positive', comment: 'good', user_name: 'Bob', message_external_id: 'ext-m1' }];
      db.execute.mockResolvedValue(rows);

      const result = await repo.getThreadFeedback('int-1');
      expect(result).toEqual(rows);
    });
  });

  describe('findMessageInThread', () => {
    it('returns message when found', async () => {
      const msg = { id: 'int-m1' };
      db._chain.where = vi.fn().mockResolvedValue([msg]);

      const result = await repo.findMessageInThread('ext-m1', 'int-t1');
      expect(result).toEqual(msg);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findMessageInThread('missing', 'int-t1');
      expect(result).toBeNull();
    });
  });

  describe('findAnnotation', () => {
    it('returns annotation when found', async () => {
      db.execute.mockResolvedValue([{ id: 'ann-1' }]);

      const result = await repo.findAnnotation('msg-1', 'user-1');
      expect(result).toEqual({ id: 'ann-1' });
    });

    it('returns null when not found', async () => {
      db.execute.mockResolvedValue([]);

      const result = await repo.findAnnotation('msg-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('createAnnotation', () => {
    it('calls db.execute with INSERT', async () => {
      db.execute.mockResolvedValue([]);

      await repo.createAnnotation({
        id: 'ann-1',
        messageId: 'msg-1',
        threadId: 'ext-1',
        score: 1,
        comment: 'good',
        metadata: { annotatorId: 'user-1' },
        resourceId: 'user-1',
      });
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateAnnotation', () => {
    it('calls db.execute with UPDATE', async () => {
      db.execute.mockResolvedValue([]);

      await repo.updateAnnotation('ann-1', {
        score: 0,
        comment: 'revised',
        metadata: { annotatorId: 'user-1' },
      });
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteAnnotation', () => {
    it('calls db.execute with DELETE', async () => {
      db.execute.mockResolvedValue([]);

      await repo.deleteAnnotation('ann-1');
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });
});
