import { describe, expect, it, vi } from 'vitest';

import { isSyncJobCancelled } from './check-cancelled';

function mockSyncJobRepo(status: string | null) {
  return {
    findStatusById: vi.fn(async () => status),
  };
}

describe('isSyncJobCancelled', () => {
  it('returns false when syncJobId is undefined', async () => {
    const repo = mockSyncJobRepo('cancelled');
    expect(await isSyncJobCancelled(repo as never, undefined)).toBe(false);
    expect(repo.findStatusById).not.toHaveBeenCalled();
  });

  it('returns true when sync job status is cancelled', async () => {
    const repo = mockSyncJobRepo('cancelled');
    expect(await isSyncJobCancelled(repo as never, 'sj-1')).toBe(true);
  });

  it('returns false when sync job status is running', async () => {
    const repo = mockSyncJobRepo('running');
    expect(await isSyncJobCancelled(repo as never, 'sj-1')).toBe(false);
  });

  it('returns false when sync job does not exist', async () => {
    const repo = mockSyncJobRepo(null);
    expect(await isSyncJobCancelled(repo as never, 'sj-missing')).toBe(false);
  });
});
