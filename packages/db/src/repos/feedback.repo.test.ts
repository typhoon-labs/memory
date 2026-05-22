import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackRepo } from './feedback.repo';

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
    insert: vi.fn().mockReturnValue(makeChain()),
    update: vi.fn().mockReturnValue(makeChain()),
    delete: vi.fn().mockReturnValue(makeChain()),
    _chain: chain,
  };

  return db;
}

describe('FeedbackRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: FeedbackRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new FeedbackRepo(db as any);
  });

  describe('findByMessageAndUser', () => {
    it('returns feedback when found', async () => {
      const entry = { id: 'fb-1' };
      db._chain.where = vi.fn().mockResolvedValue([entry]);

      const result = await repo.findByMessageAndUser('msg-1', 'user-1');
      expect(result).toEqual(entry);
      expect(db.select).toHaveBeenCalled();
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findByMessageAndUser('msg-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('deleteByMessageAndUser', () => {
    it('calls delete', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.deleteByMessageAndUser('msg-1', 'user-1');
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('returns updated feedback', async () => {
      const updated = { id: 'fb-1', rating: 'positive' as const, comment: null };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.update('fb-1', { rating: 'positive', comment: null });
      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('returns created feedback', async () => {
      const created = { id: 'fb-1', rating: 'negative', comment: 'bad' };
      db._chain.returning = vi.fn().mockResolvedValue([created]);

      const result = await repo.create({
        threadId: 't-1',
        messageId: 'msg-1',
        userId: 'user-1',
        rating: 'negative',
        comment: 'bad',
      });
      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('listAll', () => {
    it('returns all feedback entries', async () => {
      const entries = [{ id: 'fb-1' }, { id: 'fb-2' }];
      db._chain.from = vi.fn().mockResolvedValue(entries);

      const result = await repo.listAll();
      expect(result).toEqual(entries);
    });
  });

  describe('listByThreadAndUser', () => {
    it('returns feedback with message external IDs', async () => {
      const rows = [{ id: 'fb-1', messageExternalId: 'ext-1', rating: 'positive', comment: null }];
      db._chain.where = vi.fn().mockResolvedValue(rows);

      const result = await repo.listByThreadAndUser('t-1', 'user-1');
      expect(result).toEqual(rows);
    });
  });
});
