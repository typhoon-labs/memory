import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRepo } from './message.repo';

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
    delete: vi.fn().mockReturnValue(makeChain()),
    _chain: chain,
  };

  return db;
}

describe('MessageRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: MessageRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new MessageRepo(db as any);
  });

  describe('findByExternalId', () => {
    it('returns message when found', async () => {
      const msg = { id: 'internal-1', threadId: 't-1' };
      db._chain.where = vi.fn().mockResolvedValue([msg]);

      const result = await repo.findByExternalId('ext-1');
      expect(result).toEqual(msg);
      expect(db.select).toHaveBeenCalled();
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findByExternalId('missing');
      expect(result).toBeNull();
    });
  });

  describe('listByThreadId', () => {
    it('returns ordered messages', async () => {
      const msgs = [{ id: 'm-1' }, { id: 'm-2' }];
      db._chain.orderBy = vi.fn().mockResolvedValue(msgs);

      const result = await repo.listByThreadId('t-1');
      expect(result).toEqual(msgs);
    });
  });

  describe('deleteByThreadId', () => {
    it('calls delete with thread filter', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.deleteByThreadId('t-1');
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
