import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/db', () => ({
  syncJobs: {
    id: 'id',
    childJobsCompleted: 'child_jobs_completed',
    childJobsTotal: 'child_jobs_total',
    filesErrored: 'files_errored',
    status: 'status',
    completedAt: 'completed_at',
  },
}));
vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => val),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

import { incrementSyncJobCompletion } from './complete-sync-job';

function mockDb(returning: Record<string, unknown> | null = null) {
  const whereResult = returning ? [returning] : [];
  const returningFn = vi.fn(async () => whereResult);
  const whereFn = vi.fn(() => ({ returning: returningFn }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  const updateFn = vi.fn(() => ({ set: setFn }));
  return {
    update: updateFn,
    _set: setFn,
    _where: whereFn,
    _returning: returningFn,
    _updateCallCount: () => updateFn.mock.calls.length,
  };
}

describe('incrementSyncJobCompletion', () => {
  it('no-ops when syncJobId is undefined', async () => {
    const db = mockDb();
    await incrementSyncJobCompletion(db as never, undefined, false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('increments counter without completing when more jobs remain', async () => {
    const db = mockDb({ childJobsTotal: 5, childJobsCompleted: 3, status: 'running' });
    await incrementSyncJobCompletion(db as never, 'sj-1', false);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('marks sync job completed when all children report back', async () => {
    const db = mockDb({ childJobsTotal: 3, childJobsCompleted: 3, status: 'running' });
    await incrementSyncJobCompletion(db as never, 'sj-1', false);
    // First call: increment. Second call: mark completed.
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('does not double-complete when status is already completed', async () => {
    const db = mockDb({ childJobsTotal: 3, childJobsCompleted: 3, status: 'completed' });
    await incrementSyncJobCompletion(db as never, 'sj-1', false);
    // Only the increment call, no completion update
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('does not complete when status is cancelled', async () => {
    const db = mockDb({ childJobsTotal: 3, childJobsCompleted: 3, status: 'cancelled' });
    await incrementSyncJobCompletion(db as never, 'sj-1', false);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('handles missing sync job gracefully', async () => {
    const db = mockDb(null);
    await incrementSyncJobCompletion(db as never, 'sj-missing', false);
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
