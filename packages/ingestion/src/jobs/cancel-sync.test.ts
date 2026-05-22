import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { cancelSyncJob } from './cancel-sync';

function mockSyncJobRepo(found: boolean) {
  return {
    markCancelled: vi.fn(async () => (found ? { id: 'sj-1' } : null)),
  };
}

function mockQueue(jobs: Array<{ data: { syncJobId?: string }; remove: ReturnType<typeof vi.fn> }>) {
  return {
    getJobs: vi.fn(async () => jobs),
  };
}

describe('cancelSyncJob', () => {
  it('marks sync job as cancelled via repo', async () => {
    const repo = mockSyncJobRepo(true);
    const queue = mockQueue([]);
    await cancelSyncJob(repo as never, queue as never, 'sj-1');
    expect(repo.markCancelled).toHaveBeenCalledWith('sj-1');
  });

  it('returns removed count of 0 when sync job not found', async () => {
    const repo = mockSyncJobRepo(false);
    const queue = mockQueue([]);
    const result = await cancelSyncJob(repo as never, queue as never, 'sj-missing');
    expect(result).toEqual({ removed: 0 });
    expect(queue.getJobs).not.toHaveBeenCalled();
  });

  it('removes waiting/delayed jobs matching the syncJobId', async () => {
    const repo = mockSyncJobRepo(true);
    const matchingJob = { data: { syncJobId: 'sj-1' }, remove: vi.fn() };
    const otherJob = { data: { syncJobId: 'sj-other' }, remove: vi.fn() };
    const noSyncJob = { data: { syncJobId: undefined }, remove: vi.fn() };
    const queue = mockQueue([matchingJob, otherJob, noSyncJob]);

    const result = await cancelSyncJob(repo as never, queue as never, 'sj-1');

    expect(matchingJob.remove).toHaveBeenCalled();
    expect(otherJob.remove).not.toHaveBeenCalled();
    expect(noSyncJob.remove).not.toHaveBeenCalled();
    // getJobs is called twice (once for 'waiting', once for 'delayed')
    expect(queue.getJobs).toHaveBeenCalledTimes(2);
    // matchingJob appears in both calls, so removed count = 2
    expect(result.removed).toBe(2);
  });

  it('handles job.remove() throwing (race condition)', async () => {
    const repo = mockSyncJobRepo(true);
    const raceyJob = { data: { syncJobId: 'sj-1' }, remove: vi.fn().mockRejectedValue(new Error('already active')) };
    const queue = mockQueue([raceyJob]);

    const result = await cancelSyncJob(repo as never, queue as never, 'sj-1');
    // Remove failed for both waiting and delayed calls, so 0
    expect(result.removed).toBe(0);
  });
});
