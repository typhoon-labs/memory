import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncJobRepo } from './sync-job.repo';

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
    _chain: chain,
  };

  return db;
}

describe('SyncJobRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: SyncJobRepo;

  beforeEach(() => {
    db = createMockDb();
    repo = new SyncJobRepo(db as any);
  });

  describe('listByTargetId', () => {
    it('returns jobs ordered by startedAt DESC', async () => {
      const jobs = [{ id: 'j-2' }, { id: 'j-1' }];
      db._chain.orderBy = vi.fn().mockResolvedValue(jobs);

      const result = await repo.listByTargetId('st-1');
      expect(result).toEqual(jobs);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('findLatest', () => {
    it('returns latest job when found', async () => {
      const job = { id: 'j-1', syncTargetId: 'st-1' };
      db._chain.limit = vi.fn().mockResolvedValue([job]);

      const result = await repo.findLatest('st-1');
      expect(result).toEqual(job);
    });

    it('returns null when no jobs exist', async () => {
      db._chain.limit = vi.fn().mockResolvedValue([]);

      const result = await repo.findLatest('st-1');
      expect(result).toBeNull();
    });
  });

  describe('findRunning', () => {
    it('returns running jobs', async () => {
      const jobs = [{ id: 'j-1', status: 'running' }];
      db._chain.orderBy = vi.fn().mockResolvedValue(jobs);

      const result = await repo.findRunning('st-1');
      expect(result).toEqual(jobs);
    });

    it('returns empty array when none running', async () => {
      db._chain.orderBy = vi.fn().mockResolvedValue([]);

      const result = await repo.findRunning('st-1');
      expect(result).toEqual([]);
    });
  });
});
