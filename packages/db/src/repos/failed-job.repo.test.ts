import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../schema/failed-job', () => ({
  failedJobs: {
    id: 'id',
    queue: 'queue',
    createdAt: 'createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ __eq: val })),
  desc: vi.fn((col) => ({ __desc: col })),
}));

import { FailedJobRepo } from './failed-job.repo';

function createMockDb() {
  const chain = {
    _result: [] as unknown[],
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockImplementation(() => {
    const p = Promise.resolve(chain._result);
    return Object.assign(p, {
      orderBy: chain.orderBy,
      limit: chain.limit,
      offset: chain.offset,
    });
  });
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockImplementation(() => Promise.resolve(chain._result));
  chain.delete.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.values.mockImplementation(() => Promise.resolve());
  return chain;
}

describe('FailedJobRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: FailedJobRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    repo = new FailedJobRepo(db as never);
  });

  describe('list', () => {
    it('returns results ordered by createdAt', async () => {
      db._result = [{ id: 'fj-1' }, { id: 'fj-2' }];

      const result = await repo.list({ limit: 50, offset: 0 });
      expect(result).toHaveLength(2);
      expect(db.select).toHaveBeenCalled();
    });

    it('applies queue filter when provided', async () => {
      db._result = [{ id: 'fj-1', queue: 'sync' }];

      const result = await repo.list({ limit: 50, offset: 0, queue: 'sync' });
      expect(result).toHaveLength(1);
      expect(db.where).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns row when found', async () => {
      const job = { id: 'fj-1', queue: 'sync' };
      db._result = [job];

      const result = await repo.findById('fj-1');
      expect(result).toEqual(job);
    });

    it('returns null when not found', async () => {
      db._result = [];

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      await repo.delete('fj-1');
      expect(db.delete).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('inserts a new failed job', async () => {
      await repo.create({
        queue: 'sync',
        jobName: 'process-file',
        jobId: 'job-1',
        data: { docId: 'doc-1' },
        failedReason: 'timeout',
        stacktrace: 'Error: timeout',
      });
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          queue: 'sync',
          jobName: 'process-file',
          jobId: 'job-1',
          failedReason: 'timeout',
        }),
      );
    });
  });
});
