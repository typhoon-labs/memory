import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const { mockGetAllQueues, mockGetQueue, mockQueueEventBus } = vi.hoisted(() => ({
  mockGetAllQueues: vi.fn(),
  mockGetQueue: vi.fn(),
  mockQueueEventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock('../queue', () => ({
  getAllQueues: mockGetAllQueues,
  getQueue: mockGetQueue,
  queueEventBus: mockQueueEventBus,
}));

// ── Helpers ──────────────────────────────────────────────────────────

function mountRoutes(
  routes: Array<{ path: string; method: string; middleware?: unknown[]; handler: (...args: never) => unknown }>,
) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    (app as any)[route.method.toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeMockJob(
  overrides: {
    id?: string;
    name?: string;
    state?: string;
    retryFn?: () => Promise<void>;
    removeFn?: () => Promise<void>;
  } = {},
) {
  const {
    id = 'job-1',
    name = 'test-job',
    state = 'failed',
    retryFn = vi.fn().mockResolvedValue(undefined),
    removeFn = vi.fn().mockResolvedValue(undefined),
  } = overrides;

  return {
    id,
    name,
    data: { some: 'data' },
    getState: vi.fn().mockResolvedValue(state),
    retry: retryFn,
    remove: removeFn,
    attemptsMade: 1,
    timestamp: Date.now(),
    processedOn: null,
    finishedOn: null,
    failedReason: 'some error',
    returnvalue: null,
    stacktrace: [],
    progress: null,
  };
}

function makeMockQueue(
  overrides: {
    getJobCountsResult?: Record<string, number>;
    isPausedResult?: boolean;
    workersResult?: unknown[];
    jobsResult?: unknown[];
    jobResult?: unknown | null;
    cleanResult?: string[];
  } = {},
) {
  const {
    getJobCountsResult = { waiting: 1, active: 0, completed: 5, failed: 2, delayed: 0 },
    isPausedResult = false,
    workersResult = [],
    jobsResult = [],
    jobResult = null,
    cleanResult = ['job-a', 'job-b'],
  } = overrides;

  return {
    getJobCounts: vi.fn().mockResolvedValue(getJobCountsResult),
    isPaused: vi.fn().mockResolvedValue(isPausedResult),
    getWorkers: vi.fn().mockResolvedValue(workersResult),
    getJobs: vi.fn().mockResolvedValue(jobsResult),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    clean: vi.fn().mockResolvedValue(cleanResult),
    getJob: vi.fn().mockResolvedValue(jobResult),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

let app: Hono;
let mockQueue: ReturnType<typeof makeMockQueue>;

beforeEach(async () => {
  vi.clearAllMocks();

  mockQueue = makeMockQueue();

  // Default: known queue is 'sync', unknown queues throw
  mockGetQueue.mockImplementation((name: string) => {
    if (name === 'sync') return mockQueue;
    throw new Error(`Queue "${name}" not initialized`);
  });

  // Default: getAllQueues returns a Map with one entry
  mockGetAllQueues.mockReturnValue(new Map([['sync', mockQueue]]));

  const { queueRoutes } = await import('./queues');
  // biome-ignore lint/suspicious/noExplicitAny: test setup
  app = mountRoutes(queueRoutes as any);
});

// ── GET /v1/queues ───────────────────────────────────────────────────

describe('GET /v1/queues', () => {
  it('returns list of queues with job counts and pause state', async () => {
    mockQueue.getJobCounts.mockResolvedValue({ waiting: 3, active: 1, completed: 10, failed: 0, delayed: 2 });
    mockQueue.isPaused.mockResolvedValue(false);

    const res = await app.request('/v1/queues', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toEqual({
      name: 'sync',
      isPaused: false,
      counts: { waiting: 3, active: 1, completed: 10, failed: 0, delayed: 2 },
    });
  });

  it('reflects isPaused=true when queue is paused', async () => {
    mockQueue.isPaused.mockResolvedValue(true);

    const res = await app.request('/v1/queues', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0].isPaused).toBe(true);
  });

  it('returns empty array when no queues exist', async () => {
    mockGetAllQueues.mockReturnValue(new Map());

    const res = await app.request('/v1/queues', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns multiple queues when several are registered', async () => {
    const otherQueue = makeMockQueue({ isPausedResult: true });
    mockGetAllQueues.mockReturnValue(
      new Map([
        ['sync', mockQueue],
        ['other', otherQueue],
      ]),
    );

    const res = await app.request('/v1/queues', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    const names = json.map((q: { name: string }) => q.name);
    expect(names).toContain('sync');
    expect(names).toContain('other');
    const otherEntry = json.find((q: { name: string }) => q.name === 'other');
    expect(otherEntry.isPaused).toBe(true);
  });
});

// ── GET /v1/queues/:name/workers ─────────────────────────────────────

describe('GET /v1/queues/:name/workers', () => {
  it('returns workers array with serialized fields', async () => {
    mockQueue.getWorkers.mockResolvedValue([
      { id: 'w-1', addr: '127.0.0.1:6379', name: 'worker-1', age: BigInt(42), idle: BigInt(5) },
      { id: 'w-2', addr: '127.0.0.1:6380', name: 'worker-2', age: BigInt(100), idle: BigInt(0) },
    ]);

    const res = await app.request('/v1/queues/sync/workers', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ id: 'w-1', addr: '127.0.0.1:6379', name: 'worker-1', age: 42, idle: 5 });
    expect(json[1]).toEqual({ id: 'w-2', addr: '127.0.0.1:6380', name: 'worker-2', age: 100, idle: 0 });
  });

  it('returns empty workers array when no workers connected', async () => {
    mockQueue.getWorkers.mockResolvedValue([]);

    const res = await app.request('/v1/queues/sync/workers', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('converts BigInt age and idle to Number', async () => {
    mockQueue.getWorkers.mockResolvedValue([
      { id: 'w-1', addr: '0.0.0.0:0', name: 'w', age: BigInt(9999), idle: BigInt(1234) },
    ]);

    const res = await app.request('/v1/queues/sync/workers', { method: 'GET' });

    const json = await res.json();
    expect(typeof json[0].age).toBe('number');
    expect(typeof json[0].idle).toBe('number');
    expect(json[0].age).toBe(9999);
    expect(json[0].idle).toBe(1234);
  });

  it('returns 404 for unknown queue name', async () => {
    const res = await app.request('/v1/queues/unknown/workers', { method: 'GET' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── GET /v1/queues/:name/jobs ─────────────────────────────────────────

describe('GET /v1/queues/:name/jobs', () => {
  it('returns jobs with serialized fields', async () => {
    const job = makeMockJob({ id: 'job-42', name: 'ingest', state: 'completed' });
    job.processedOn = 1700000001000 as never;
    job.finishedOn = 1700000002000 as never;
    job.returnvalue = { result: 'ok' } as never;
    job.progress = 100 as never;
    mockQueue.getJobs.mockResolvedValue([job]);

    const res = await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({
      id: 'job-42',
      name: 'ingest',
      state: 'completed',
      attemptsMade: 1,
      processedOn: 1700000001000,
      finishedOn: 1700000002000,
      returnvalue: { result: 'ok' },
      progress: 100,
    });
  });

  it('fetches all states by default when state param is omitted', async () => {
    mockQueue.getJobs.mockResolvedValue([]);

    await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    expect(mockQueue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 49);
  });

  it('uses default start=0 and pageSize=50', async () => {
    mockQueue.getJobs.mockResolvedValue([]);

    await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    expect(mockQueue.getJobs).toHaveBeenCalledWith(expect.any(Array), 0, 49);
  });

  it('respects custom start and pageSize query params', async () => {
    mockQueue.getJobs.mockResolvedValue([]);

    await app.request('/v1/queues/sync/jobs?start=10&pageSize=25', { method: 'GET' });

    expect(mockQueue.getJobs).toHaveBeenCalledWith(expect.any(Array), 10, 34);
  });

  it('caps pageSize at 200', async () => {
    mockQueue.getJobs.mockResolvedValue([]);

    await app.request('/v1/queues/sync/jobs?pageSize=500', { method: 'GET' });

    expect(mockQueue.getJobs).toHaveBeenCalledWith(expect.any(Array), 0, 199);
  });

  it('filters by specific state when state param is provided', async () => {
    mockQueue.getJobs.mockResolvedValue([]);

    await app.request('/v1/queues/sync/jobs?state=failed', { method: 'GET' });

    expect(mockQueue.getJobs).toHaveBeenCalledWith(['failed'], 0, 49);
  });

  it('maps null processedOn and finishedOn', async () => {
    const job = makeMockJob({ state: 'waiting' });
    mockQueue.getJobs.mockResolvedValue([job]);

    const res = await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    const json = await res.json();
    expect(json[0].processedOn).toBeNull();
    expect(json[0].finishedOn).toBeNull();
  });

  it('maps null failedReason and returnvalue when absent', async () => {
    const job = makeMockJob({ state: 'completed' });
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (job as any).failedReason = undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (job as any).returnvalue = undefined;
    mockQueue.getJobs.mockResolvedValue([job]);

    const res = await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    const json = await res.json();
    expect(json[0].failedReason).toBeNull();
    expect(json[0].returnvalue).toBeNull();
  });

  it('defaults stacktrace to empty array when absent', async () => {
    const job = makeMockJob({ state: 'completed' });
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (job as any).stacktrace = undefined;
    mockQueue.getJobs.mockResolvedValue([job]);

    const res = await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    const json = await res.json();
    expect(json[0].stacktrace).toEqual([]);
  });

  it('returns empty array when queue has no jobs', async () => {
    mockQueue.getJobs.mockResolvedValue([]);

    const res = await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns 404 for unknown queue', async () => {
    const res = await app.request('/v1/queues/unknown/jobs', { method: 'GET' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── POST /v1/queues/:name/pause ──────────────────────────────────────

describe('POST /v1/queues/:name/pause', () => {
  it('calls queue.pause() and returns { ok: true }', async () => {
    const res = await app.request('/v1/queues/sync/pause', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockQueue.pause).toHaveBeenCalledOnce();
  });

  it('returns 404 for unknown queue', async () => {
    const res = await app.request('/v1/queues/unknown/pause', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
    expect(mockQueue.pause).not.toHaveBeenCalled();
  });
});

// ── POST /v1/queues/:name/resume ─────────────────────────────────────

describe('POST /v1/queues/:name/resume', () => {
  it('calls queue.resume() and returns { ok: true }', async () => {
    const res = await app.request('/v1/queues/sync/resume', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockQueue.resume).toHaveBeenCalledOnce();
  });

  it('returns 404 for unknown queue', async () => {
    const res = await app.request('/v1/queues/unknown/resume', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
    expect(mockQueue.resume).not.toHaveBeenCalled();
  });
});

// ── POST /v1/queues/:name/clean ──────────────────────────────────────

describe('POST /v1/queues/:name/clean', () => {
  it('calls queue.clean() with correct args and returns { ok, removed }', async () => {
    mockQueue.clean.mockResolvedValue(['id1', 'id2', 'id3']);

    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'completed', grace: 5000, limit: 100 }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, removed: 3 });
    expect(mockQueue.clean).toHaveBeenCalledWith(5000, 100, 'completed');
  });

  it('uses default grace=0 and limit=1000 when not provided', async () => {
    mockQueue.clean.mockResolvedValue([]);

    await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'failed' }),
    });

    expect(mockQueue.clean).toHaveBeenCalledWith(0, 1000, 'failed');
  });

  it('returns correct removed count from clean result', async () => {
    mockQueue.clean.mockResolvedValue(['a', 'b']);

    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'completed' }),
    });

    const json = await res.json();
    expect(json.removed).toBe(2);
  });

  it('accepts all valid state enum values', async () => {
    mockQueue.clean.mockResolvedValue([]);

    for (const state of ['completed', 'failed', 'delayed', 'wait']) {
      const res = await app.request('/v1/queues/sync/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      expect(res.status).toBe(200);
    }
  });

  it('returns 400 for invalid state enum value', async () => {
    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'active' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(json.details).toBeDefined();
  });

  it('returns 400 when state is missing', async () => {
    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grace: 0 }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when grace is negative', async () => {
    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'completed', grace: -1 }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when limit exceeds 10000', async () => {
    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'completed', limit: 10001 }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown queue', async () => {
    const res = await app.request('/v1/queues/unknown/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'completed' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── POST /v1/queues/:name/jobs/:jobId/retry ──────────────────────────

describe('POST /v1/queues/:name/jobs/:jobId/retry', () => {
  it('returns { ok: true } for a failed job', async () => {
    const job = makeMockJob({ id: 'job-1', state: 'failed' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-1/retry', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(job.retry).toHaveBeenCalledOnce();
  });

  it('returns 400 when job is not in failed state', async () => {
    const job = makeMockJob({ id: 'job-2', state: 'completed' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-2/retry', { method: 'POST' });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/completed/);
    expect(job.retry).not.toHaveBeenCalled();
  });

  it('returns 400 when job is in active state', async () => {
    const job = makeMockJob({ id: 'job-3', state: 'active' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-3/retry', { method: 'POST' });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/active/);
  });

  it('returns 404 when job is not found', async () => {
    mockQueue.getJob.mockResolvedValue(null);

    const res = await app.request('/v1/queues/sync/jobs/missing-job/retry', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Job not found');
  });

  it('returns 404 for unknown queue', async () => {
    const res = await app.request('/v1/queues/unknown/jobs/job-1/retry', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── DELETE /v1/queues/:name/jobs/:jobId ──────────────────────────────

describe('DELETE /v1/queues/:name/jobs/:jobId', () => {
  it('returns { ok: true } for a non-active job', async () => {
    const job = makeMockJob({ id: 'job-1', state: 'completed' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(job.remove).toHaveBeenCalledOnce();
  });

  it('returns 409 when job is in active state', async () => {
    const job = makeMockJob({ id: 'job-active', state: 'active' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-active', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/active/i);
    expect(job.remove).not.toHaveBeenCalled();
  });

  it('returns 409 when job.remove() throws an Error', async () => {
    const removeFn = vi.fn().mockRejectedValue(new Error('Cannot remove: already locked'));
    const job = makeMockJob({ id: 'job-locked', state: 'failed', removeFn });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-locked', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Cannot remove: already locked');
  });

  it('returns 409 with generic message when job.remove() throws a non-Error', async () => {
    const removeFn = vi.fn().mockRejectedValue('unexpected string error');
    const job = makeMockJob({ id: 'job-err', state: 'failed', removeFn });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-err', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Failed to remove job');
  });

  it('returns 404 when job is not found', async () => {
    mockQueue.getJob.mockResolvedValue(null);

    const res = await app.request('/v1/queues/sync/jobs/missing-job', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Job not found');
  });

  it('returns 404 for unknown queue', async () => {
    const res = await app.request('/v1/queues/unknown/jobs/job-1', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });

  it('removes a failed job successfully', async () => {
    const job = makeMockJob({ id: 'job-failed', state: 'failed' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-failed', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(job.remove).toHaveBeenCalledOnce();
  });

  it('removes a waiting job successfully', async () => {
    const job = makeMockJob({ id: 'job-waiting', state: 'waiting' });
    mockQueue.getJob.mockResolvedValue(job);

    const res = await app.request('/v1/queues/sync/jobs/job-waiting', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(job.remove).toHaveBeenCalledOnce();
  });
});
