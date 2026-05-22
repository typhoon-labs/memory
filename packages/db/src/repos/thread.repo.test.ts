import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThreadRepo } from './thread.repo';

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

describe('ThreadRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: ThreadRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new ThreadRepo(db as any);
  });

  describe('findByExternalId', () => {
    it('returns thread id when found', async () => {
      const thread = { id: 'internal-1' };
      db._chain.where = vi.fn().mockResolvedValue([thread]);

      const result = await repo.findByExternalId('ext-1');
      expect(result).toEqual(thread);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findByExternalId('missing');
      expect(result).toBeNull();
    });
  });

  describe('findFullByExternalId', () => {
    it('returns full thread without resourceId filter', async () => {
      const thread = { id: 'internal-1', externalId: 'ext-1', title: 'Test' };
      db._chain.where = vi.fn().mockResolvedValue([thread]);

      const result = await repo.findFullByExternalId('ext-1');
      expect(result).toEqual(thread);
    });

    it('returns full thread with resourceId filter', async () => {
      const thread = { id: 'internal-1', externalId: 'ext-1', resourceId: 'user-1' };
      db._chain.where = vi.fn().mockResolvedValue([thread]);

      const result = await repo.findFullByExternalId('ext-1', 'user-1');
      expect(result).toEqual(thread);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findFullByExternalId('missing');
      expect(result).toBeNull();
    });
  });

  describe('listByResourceId', () => {
    it('returns paginated rows and total', async () => {
      const rows = [{ id: 'internal-1' }];

      // listByResourceId calls db.select() twice in Promise.all:
      // 1) select().from().where().orderBy().limit().offset() -> rows
      // 2) select({total}).from().where() -> [{total: 42}]
      // We need separate chains per select() call.
      let selectCallCount = 0;

      const makeChainResolving = (terminalValue: unknown) => {
        const handler: ProxyHandler<Record<string, unknown>> = {
          get(_, prop) {
            if (prop === 'then') {
              // Make it thenable, resolving to the terminal value
              return (resolve: (v: unknown) => void) => resolve(terminalValue);
            }
            return vi.fn().mockReturnValue(new Proxy({}, handler));
          },
        };
        return new Proxy({}, handler);
      };

      db.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return makeChainResolving(rows);
        }
        return makeChainResolving([{ total: 42 }]);
      });

      const result = await repo.listByResourceId('user-1', { limit: 10, offset: 0 });
      expect(result).toEqual({ rows, total: 42 });
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('returns the created thread', async () => {
      const thread = { id: 'internal-1', externalId: 'ext-1', title: 'New' };
      db._chain.returning = vi.fn().mockResolvedValue([thread]);

      const result = await repo.create({
        externalId: 'ext-1',
        resourceId: 'user-1',
        title: 'New',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(result).toEqual(thread);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('returns updated thread', async () => {
      const updated = { id: 'internal-1', title: 'Updated' };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.update('ext-1', 'user-1', { title: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('returns null when no match', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.update('ext-1', 'user-1', { title: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('calls delete with id', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.delete('internal-1');
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
