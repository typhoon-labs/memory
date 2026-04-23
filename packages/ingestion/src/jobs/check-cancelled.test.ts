import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/db', () => ({
  syncJobs: { id: 'id', status: 'status' },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => val),
}));

import { isSyncJobCancelled } from './check-cancelled';

function mockDb(status: string | null) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => (status ? [{ status }] : [])),
      })),
    })),
  };
}

describe('isSyncJobCancelled', () => {
  it('returns false when syncJobId is undefined', async () => {
    const db = mockDb('cancelled');
    expect(await isSyncJobCancelled(db as never, undefined)).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns true when sync job status is cancelled', async () => {
    const db = mockDb('cancelled');
    expect(await isSyncJobCancelled(db as never, 'sj-1')).toBe(true);
  });

  it('returns false when sync job status is running', async () => {
    const db = mockDb('running');
    expect(await isSyncJobCancelled(db as never, 'sj-1')).toBe(false);
  });

  it('returns false when sync job does not exist', async () => {
    const db = mockDb(null);
    expect(await isSyncJobCancelled(db as never, 'sj-missing')).toBe(false);
  });
});
