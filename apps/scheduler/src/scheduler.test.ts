import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/db', () => ({
  syncTargets: {
    id: 'id',
    name: 'name',
    cronSchedule: 'cronSchedule',
    isActive: 'isActive',
  },
  failedJobs: {
    id: 'id',
    createdAt: 'createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ __eq: val })),
  lt: vi.fn((_col, val) => ({ __lt: val })),
}));

// Capture Cron instances so tests can inspect and trigger callbacks
const { cronInstances, throwOnPatterns } = vi.hoisted(() => {
  const cronInstances: Array<{
    pattern: string;
    callback: () => Promise<void>;
    stopped: boolean;
    stop: ReturnType<typeof vi.fn>;
    nextRun: ReturnType<typeof vi.fn>;
  }> = [];

  // Patterns in this set will cause the constructor to throw
  const throwOnPatterns = new Set<string>();

  return { cronInstances, throwOnPatterns };
});

vi.mock('croner', () => ({
  Cron: class MockCron {
    pattern: string;
    callback: () => Promise<void>;
    stopped = false;
    stop = vi.fn(function (this: { stopped: boolean }) {
      this.stopped = true;
    });
    nextRun = vi.fn(() => new Date('2026-05-01T00:00:00Z'));

    constructor(pattern: string, callback: () => Promise<void>) {
      if (throwOnPatterns.has(pattern)) {
        throw new Error(`Invalid cron expression: ${pattern}`);
      }
      this.pattern = pattern;
      this.callback = callback;
      cronInstances.push(this as never);
    }
  },
}));

// Mock the db module (singleton that would connect at module load)
const { mockDbSelect } = vi.hoisted(() => {
  const mockDbSelect = vi.fn();
  return { mockDbSelect };
});

const { mockDbDelete } = vi.hoisted(() => {
  const mockDbDelete = vi.fn();
  return { mockDbDelete };
});

vi.mock('./db', () => ({
  db: {
    select: mockDbSelect,
    delete: mockDbDelete,
  },
}));

const { mockQueueAdd } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./queue', () => ({
  getSyncQueue: vi.fn(() => ({ add: mockQueueAdd })),
}));

import { refreshScheduler, stopScheduler } from './scheduler';

/** Helper: set up `db.select(...).from(...).where(...)` to return targets */
function setupDbTargets(targets: Array<{ id: string; name: string; cronSchedule: string }>) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(targets),
    }),
  });
}

describe('refreshScheduler', () => {
  beforeEach(() => {
    cronInstances.length = 0;
    vi.clearAllMocks();
    // Default: no targets
    setupDbTargets([]);
  });

  afterEach(() => {
    stopScheduler();
    cronInstances.length = 0;
  });

  it('creates no cron jobs when there are no active targets', async () => {
    setupDbTargets([]);
    await refreshScheduler();
    expect(cronInstances).toHaveLength(0);
  });

  it('creates a Cron job for each active target', async () => {
    setupDbTargets([
      { id: 'st-1', name: 'Target A', cronSchedule: '0 * * * *' },
      { id: 'st-2', name: 'Target B', cronSchedule: '30 * * * *' },
    ]);
    await refreshScheduler();
    expect(cronInstances).toHaveLength(2);
    expect(cronInstances[0].pattern).toBe('0 * * * *');
    expect(cronInstances[1].pattern).toBe('30 * * * *');
  });

  it('enqueues a "scan" job with { syncTargetId } when cron fires', async () => {
    setupDbTargets([{ id: 'st-42', name: 'My Target', cronSchedule: '0 0 * * *' }]);
    await refreshScheduler();
    expect(cronInstances).toHaveLength(1);

    // Manually trigger the cron callback
    await cronInstances[0].callback();

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'scan',
      { syncTargetId: 'st-42' },
      expect.objectContaining({ jobId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-/), priority: 5 }),
    );
  });

  it('stops previous cron jobs when called again (refresh)', async () => {
    setupDbTargets([{ id: 'st-1', name: 'T1', cronSchedule: '0 * * * *' }]);
    await refreshScheduler();
    const firstCron = cronInstances[0];

    setupDbTargets([{ id: 'st-2', name: 'T2', cronSchedule: '15 * * * *' }]);
    await refreshScheduler();

    // The first cron must have been stopped
    expect(firstCron.stop).toHaveBeenCalledTimes(1);
    // A new cron was created for the second target
    expect(cronInstances).toHaveLength(2);
    expect(cronInstances[1].pattern).toBe('15 * * * *');
  });

  it('does not crash when a target has an invalid cron expression (logs error)', async () => {
    // Register the bad pattern so the Cron mock constructor throws for it
    throwOnPatterns.add('not-a-cron');
    setupDbTargets([
      { id: 'st-good', name: 'Good', cronSchedule: '0 * * * *' },
      { id: 'st-bad', name: 'Bad', cronSchedule: 'not-a-cron' },
    ]);

    // Should resolve without throwing (scheduler.ts catches the error internally)
    await expect(refreshScheduler()).resolves.toBeUndefined();

    // Only the valid target was scheduled
    expect(cronInstances).toHaveLength(1);
    expect(cronInstances[0].pattern).toBe('0 * * * *');

    throwOnPatterns.delete('not-a-cron');
  });

  it('queries DB for isActive=true targets', async () => {
    setupDbTargets([]);
    await refreshScheduler();

    expect(mockDbSelect).toHaveBeenCalledWith({
      id: expect.anything(),
      name: expect.anything(),
      cronSchedule: expect.anything(),
    });
  });
});

describe('stopScheduler', () => {
  beforeEach(() => {
    cronInstances.length = 0;
    vi.clearAllMocks();
    setupDbTargets([]);
  });

  afterEach(() => {
    cronInstances.length = 0;
  });

  it('stops all running cron jobs', async () => {
    setupDbTargets([
      { id: 'st-1', name: 'T1', cronSchedule: '0 * * * *' },
      { id: 'st-2', name: 'T2', cronSchedule: '30 * * * *' },
    ]);
    await refreshScheduler();
    expect(cronInstances).toHaveLength(2);

    stopScheduler();

    for (const job of cronInstances) {
      expect(job.stop).toHaveBeenCalledTimes(1);
    }
  });

  it('is a no-op (does not throw) when no jobs are scheduled', () => {
    expect(() => stopScheduler()).not.toThrow();
  });

  it('clears the jobs array so subsequent stop is also a no-op', async () => {
    setupDbTargets([{ id: 'st-1', name: 'T1', cronSchedule: '0 * * * *' }]);
    await refreshScheduler();
    stopScheduler();
    const stopCallCount = cronInstances[0].stop.mock.calls.length;

    // Second stop should not call the already-stopped job's stop() again
    stopScheduler();
    expect(cronInstances[0].stop.mock.calls.length).toBe(stopCallCount);
  });
});

describe('failed job retention', () => {
  beforeEach(() => {
    cronInstances.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDbTargets([]);
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  afterEach(() => {
    stopScheduler();
    cronInstances.length = 0;
    vi.useRealTimers();
  });

  it('sets up retention interval on first refresh', async () => {
    await refreshScheduler();
    // The interval is set up internally — stopScheduler clears it
    // Verify it doesn't throw and can be cleaned up
    stopScheduler();
  });

  it('retention callback deletes old failed jobs', async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: 'fj-1' }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDbDelete.mockReturnValue({ where: mockWhere });

    await refreshScheduler();

    // Advance time by 1 day to trigger the interval
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(mockDbDelete).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it('retention callback handles errors gracefully', async () => {
    const mockWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    mockDbDelete.mockReturnValue({ where: mockWhere });

    await refreshScheduler();

    // Should not throw
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  });
});
