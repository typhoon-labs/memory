import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOk } from '../test-helpers';
// ── Helpers ──────────────────────────────────────────────────────────
import type { QueueServiceDeps } from './queue.service';
import { QueueService } from './queue.service';

function makeMockQueue(overrides: Record<string, unknown> = {}) {
  return {
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, active: 0, completed: 5, failed: 2, delayed: 0 }),
    isPaused: vi.fn().mockResolvedValue(false),
    getWorkers: vi.fn().mockResolvedValue([]),
    getJobs: vi.fn().mockResolvedValue([]),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    clean: vi.fn().mockResolvedValue(['id1', 'id2']),
    getJob: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeMockFailedJobRepo(defaultResult: unknown[] = []) {
  return {
    list: vi.fn().mockResolvedValue(defaultResult),
    findById: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  };
}

function createDeps(overrides: Partial<QueueServiceDeps> = {}): QueueServiceDeps {
  const mockQueue = makeMockQueue();
  return {
    getAllQueues: vi.fn().mockReturnValue(new Map([['sync', mockQueue]])),
    getQueue: vi.fn().mockImplementation((name: string) => {
      if (name === 'sync') return mockQueue;
      throw new Error(`Queue "${name}" not initialized`);
    }),
    failedJobRepo: makeMockFailedJobRepo() as never,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('QueueService', () => {
  let service: QueueService;
  let deps: QueueServiceDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createDeps();
    service = new QueueService(deps);
  });

  describe('listQueues', () => {
    it('returns all queues with counts and pause state', async () => {
      const result = await service.listQueues();
      const data = assertOk(result);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('sync');
      expect(data[0].counts).toEqual({ waiting: 1, active: 0, completed: 5, failed: 2, delayed: 0 });
    });
  });

  describe('listWorkers', () => {
    it('returns workers for a known queue', async () => {
      const mockQueue = makeMockQueue({
        getWorkers: vi
          .fn()
          .mockResolvedValue([
            { id: 'w-1', addr: '127.0.0.1:6379', name: 'worker-1', age: BigInt(42), idle: BigInt(5) },
          ]),
      });
      deps = createDeps({
        getQueue: vi.fn().mockReturnValue(mockQueue),
      });
      service = new QueueService(deps);

      const result = await service.listWorkers('sync');
      const data = assertOk(result);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({ id: 'w-1', addr: '127.0.0.1:6379', name: 'worker-1', age: 42, idle: 5 });
    });

    it('returns error for unknown queue', async () => {
      const result = await service.listWorkers('unknown');
      expect(result).toEqual({ error: 'Queue not found' });
    });
  });

  describe('retryJob', () => {
    it('retries a failed job', async () => {
      const mockJob = { getState: vi.fn().mockResolvedValue('failed'), retry: vi.fn().mockResolvedValue(undefined) };
      const mockQueue = makeMockQueue({ getJob: vi.fn().mockResolvedValue(mockJob) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.retryJob('sync', 'job-1');
      expect(result).toEqual({ data: { ok: true } });
      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('returns error if job is not in failed state', async () => {
      const mockJob = { getState: vi.fn().mockResolvedValue('completed'), retry: vi.fn() };
      const mockQueue = makeMockQueue({ getJob: vi.fn().mockResolvedValue(mockJob) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.retryJob('sync', 'job-1');
      expect(result).toEqual({ error: 'Cannot retry job in state "completed" — must be failed' });
    });

    it('returns error if job not found', async () => {
      const result = await service.retryJob('sync', 'missing');
      expect(result).toEqual({ error: 'Job not found' });
    });
  });

  describe('removeJob', () => {
    it('removes a non-active job', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      const mockQueue = makeMockQueue({ getJob: vi.fn().mockResolvedValue(mockJob) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.removeJob('sync', 'job-1');
      expect(result).toEqual({ data: { ok: true } });
    });

    it('returns error for active job', async () => {
      const mockJob = { getState: vi.fn().mockResolvedValue('active'), remove: vi.fn() };
      const mockQueue = makeMockQueue({ getJob: vi.fn().mockResolvedValue(mockJob) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.removeJob('sync', 'job-1');
      expect(result).toEqual({ error: 'Cannot remove an active job. Wait for it to finish or stop the worker.' });
    });

    it('returns error when remove throws', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('failed'),
        remove: vi.fn().mockRejectedValue(new Error('Locked')),
      };
      const mockQueue = makeMockQueue({ getJob: vi.fn().mockResolvedValue(mockJob) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.removeJob('sync', 'job-1');
      expect(result).toEqual({ error: 'Locked' });
    });
  });

  describe('cleanQueue', () => {
    it('cleans jobs from the queue', async () => {
      const result = await service.cleanQueue('sync', { state: 'completed', grace: 5000, limit: 100 });
      const data = assertOk(result);
      expect(data).toEqual({ ok: true, removed: 2 });
    });

    it('returns error for unknown queue', async () => {
      const result = await service.cleanQueue('unknown', { state: 'completed', grace: 0, limit: 100 });
      expect(result).toEqual({ error: 'Queue not found' });
    });
  });

  describe('listJobs', () => {
    it('returns serialized jobs for a specific state', async () => {
      const mockJob = {
        id: 'j-1',
        name: 'processDoc',
        data: { docId: 'd-1' },
        getState: vi.fn().mockResolvedValue('waiting'),
        attemptsMade: 0,
        timestamp: 1700000000000,
        processedOn: undefined,
        finishedOn: undefined,
        failedReason: undefined,
        returnvalue: undefined,
        stacktrace: undefined,
        progress: undefined,
      };
      const mockQueue = makeMockQueue({ getJob: vi.fn(), getJobs: vi.fn().mockResolvedValue([mockJob]) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.listJobs('sync', 'waiting', 0, 50);
      const data = assertOk(result);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        id: 'j-1',
        name: 'processDoc',
        data: { docId: 'd-1' },
        state: 'waiting',
        attemptsMade: 0,
        timestamp: 1700000000000,
        processedOn: null,
        finishedOn: null,
        failedReason: null,
        returnvalue: null,
        stacktrace: [],
        progress: null,
      });
    });

    it('uses all states when stateParam is "all"', async () => {
      const mockQueue = makeMockQueue({ getJobs: vi.fn().mockResolvedValue([]) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.listJobs('sync', 'all', 0, 25);
      expect(result).toEqual({ data: [] });
      expect(mockQueue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 24);
    });

    it('caps pageSize at 200', async () => {
      const mockQueue = makeMockQueue({ getJobs: vi.fn().mockResolvedValue([]) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      await service.listJobs('sync', 'failed', 0, 500);
      expect(mockQueue.getJobs).toHaveBeenCalledWith(['failed'], 0, 199);
    });

    it('returns error for unknown queue', async () => {
      const result = await service.listJobs('unknown', 'waiting', 0, 50);
      expect(result).toEqual({ error: 'Queue not found' });
    });
  });

  describe('pauseQueue', () => {
    it('pauses a known queue', async () => {
      const result = await service.pauseQueue('sync');
      expect(result).toEqual({ data: { ok: true } });
    });

    it('returns error for unknown queue', async () => {
      const result = await service.pauseQueue('unknown');
      expect(result).toEqual({ error: 'Queue not found' });
    });
  });

  describe('resumeQueue', () => {
    it('resumes a known queue', async () => {
      const result = await service.resumeQueue('sync');
      expect(result).toEqual({ data: { ok: true } });
    });

    it('returns error for unknown queue', async () => {
      const result = await service.resumeQueue('unknown');
      expect(result).toEqual({ error: 'Queue not found' });
    });
  });

  describe('listFailedJobs', () => {
    it('queries failed jobs table without queue filter', async () => {
      const result = await service.listFailedJobs({ limit: 50, offset: 0 });
      expect(result).toHaveProperty('data');
      expect(deps.failedJobRepo.list).toHaveBeenCalledWith({ limit: 50, offset: 0, queue: undefined });
    });

    it('queries with queue filter when provided', async () => {
      const repo = makeMockFailedJobRepo([{ id: 'fj-1', queue: 'sync', error: 'boom' }]);
      deps = createDeps({ failedJobRepo: repo as never });
      service = new QueueService(deps);

      const result = await service.listFailedJobs({ limit: 50, offset: 0, queue: 'sync' });
      const data = assertOk(result);
      expect(data).toEqual([{ id: 'fj-1', queue: 'sync', error: 'boom' }]);
      expect(repo.list).toHaveBeenCalledWith({ limit: 50, offset: 0, queue: 'sync' });
    });
  });

  describe('getFailedJob', () => {
    it('returns error when not found', async () => {
      const result = await service.getFailedJob('missing');
      expect(result).toEqual({ error: 'Not found' });
    });

    it('returns job data when found', async () => {
      const repo = makeMockFailedJobRepo();
      const jobRecord = { id: 'fj-1', queue: 'sync', error: 'timeout' };
      repo.findById.mockResolvedValueOnce(jobRecord);
      deps = createDeps({ failedJobRepo: repo as never });
      service = new QueueService(deps);

      const result = await service.getFailedJob('fj-1');
      expect(result).toEqual({ data: jobRecord });
    });
  });

  describe('deleteFailedJob', () => {
    it('deletes and returns ok', async () => {
      const result = await service.deleteFailedJob('fj-1');
      expect(result).toEqual({ data: { ok: true } });
      expect(deps.failedJobRepo.delete).toHaveBeenCalledWith('fj-1');
    });
  });

  describe('removeJob — additional branches', () => {
    it('returns error when queue not found', async () => {
      const result = await service.removeJob('unknown', 'job-1');
      expect(result).toEqual({ error: 'Queue not found' });
    });

    it('returns error when job not found', async () => {
      const result = await service.removeJob('sync', 'missing');
      expect(result).toEqual({ error: 'Job not found' });
    });

    it('returns generic message when remove throws non-Error', async () => {
      const mockJob = {
        getState: vi.fn().mockResolvedValue('failed'),
        remove: vi.fn().mockRejectedValue('string-error'),
      };
      const mockQueue = makeMockQueue({ getJob: vi.fn().mockResolvedValue(mockJob) });
      deps = createDeps({ getQueue: vi.fn().mockReturnValue(mockQueue) });
      service = new QueueService(deps);

      const result = await service.removeJob('sync', 'job-1');
      expect(result).toEqual({ error: 'Failed to remove job' });
    });
  });

  describe('retryJob — additional branches', () => {
    it('returns error when queue not found', async () => {
      const result = await service.retryJob('unknown', 'job-1');
      expect(result).toEqual({ error: 'Queue not found' });
    });
  });
});
