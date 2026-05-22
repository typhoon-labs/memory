import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { incrementSyncJobCompletion } from './complete-sync-job';

function mockSyncJobRepo(returning: Record<string, unknown> | null = null) {
  return {
    incrementCompletion: vi.fn(async () => returning),
    markCompleted: vi.fn(async () => {}),
  };
}

describe('incrementSyncJobCompletion', () => {
  it('no-ops when syncJobId is undefined', async () => {
    const repo = mockSyncJobRepo();
    await incrementSyncJobCompletion(repo as never, undefined, false);
    expect(repo.incrementCompletion).not.toHaveBeenCalled();
  });

  it('increments counter without completing when more jobs remain', async () => {
    const repo = mockSyncJobRepo({ childJobsTotal: 5, childJobsCompleted: 3, status: 'running' });
    await incrementSyncJobCompletion(repo as never, 'sj-1', false);
    expect(repo.incrementCompletion).toHaveBeenCalledWith('sj-1', false);
    expect(repo.markCompleted).not.toHaveBeenCalled();
  });

  it('marks sync job completed when all children report back', async () => {
    const repo = mockSyncJobRepo({ childJobsTotal: 3, childJobsCompleted: 3, status: 'running' });
    await incrementSyncJobCompletion(repo as never, 'sj-1', false);
    expect(repo.incrementCompletion).toHaveBeenCalledWith('sj-1', false);
    expect(repo.markCompleted).toHaveBeenCalledWith('sj-1');
  });

  it('does not double-complete when status is already completed', async () => {
    const repo = mockSyncJobRepo({ childJobsTotal: 3, childJobsCompleted: 3, status: 'completed' });
    await incrementSyncJobCompletion(repo as never, 'sj-1', false);
    expect(repo.markCompleted).not.toHaveBeenCalled();
  });

  it('does not complete when status is cancelled', async () => {
    const repo = mockSyncJobRepo({ childJobsTotal: 3, childJobsCompleted: 3, status: 'cancelled' });
    await incrementSyncJobCompletion(repo as never, 'sj-1', false);
    expect(repo.markCompleted).not.toHaveBeenCalled();
  });

  it('handles missing sync job gracefully', async () => {
    const repo = mockSyncJobRepo(null);
    await incrementSyncJobCompletion(repo as never, 'sj-missing', false);
    expect(repo.markCompleted).not.toHaveBeenCalled();
  });
});
