import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const { mockQueueService, mockQueueEventBus } = vi.hoisted(() => ({
  mockQueueService: {
    listQueues: vi.fn(),
    listWorkers: vi.fn(),
    listJobs: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
    cleanQueue: vi.fn(),
    retryJob: vi.fn(),
    removeJob: vi.fn(),
    listFailedJobs: vi.fn(),
    getFailedJob: vi.fn(),
    deleteFailedJob: vi.fn(),
  },
  mockQueueEventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('../services', () => ({
  getQueueService: () => mockQueueService,
}));

vi.mock('@typhoon/services', () => ({
  isError: (result: unknown) =>
    result !== null && result !== undefined && typeof result === 'object' && 'error' in result,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock('../infra/queue', () => ({
  queueEventBus: mockQueueEventBus,
}));

// ── Helpers ──────────────────────────────────────────────────────────

function mountRoutes(
  routes: Array<{ path: string; method: string; middleware?: unknown[]; handler: (...args: never) => unknown }>,
) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[route.method.toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  vi.clearAllMocks();

  // Defaults
  mockQueueService.listQueues.mockResolvedValue({
    data: [{ name: 'sync', isPaused: false, counts: { waiting: 1, active: 0, completed: 5, failed: 2, delayed: 0 } }],
  });
  mockQueueService.listWorkers.mockResolvedValue({ data: [] });
  mockQueueService.listJobs.mockResolvedValue({ data: [] });
  mockQueueService.pauseQueue.mockResolvedValue({ data: { ok: true } });
  mockQueueService.resumeQueue.mockResolvedValue({ data: { ok: true } });
  mockQueueService.cleanQueue.mockResolvedValue({ data: { ok: true, removed: 2 } });
  mockQueueService.retryJob.mockResolvedValue({ data: { ok: true } });
  mockQueueService.removeJob.mockResolvedValue({ data: { ok: true } });
  mockQueueService.listFailedJobs.mockResolvedValue({ data: [] });
  mockQueueService.getFailedJob.mockResolvedValue({ error: 'Not found' });
  mockQueueService.deleteFailedJob.mockResolvedValue({ data: { ok: true } });

  const { queueRoutes } = await import('./queues');
  app = mountRoutes(queueRoutes as any);
});

// ── GET /v1/queues ───────────────────────────────────────────────────

describe('GET /v1/queues', () => {
  it('returns list of queues with job counts and pause state', async () => {
    mockQueueService.listQueues.mockResolvedValue({
      data: [
        { name: 'sync', isPaused: false, counts: { waiting: 3, active: 1, completed: 10, failed: 0, delayed: 2 } },
      ],
    });

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
    mockQueueService.listQueues.mockResolvedValue({
      data: [{ name: 'sync', isPaused: true, counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 } }],
    });

    const res = await app.request('/v1/queues', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0].isPaused).toBe(true);
  });

  it('returns empty array when no queues exist', async () => {
    mockQueueService.listQueues.mockResolvedValue({ data: [] });

    const res = await app.request('/v1/queues', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns multiple queues when several are registered', async () => {
    mockQueueService.listQueues.mockResolvedValue({
      data: [
        { name: 'sync', isPaused: false, counts: { waiting: 1, active: 0, completed: 5, failed: 2, delayed: 0 } },
        { name: 'other', isPaused: true, counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 } },
      ],
    });

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
    mockQueueService.listWorkers.mockResolvedValue({
      data: [
        { id: 'w-1', addr: '127.0.0.1:6379', name: 'worker-1', age: 42, idle: 5 },
        { id: 'w-2', addr: '127.0.0.1:6380', name: 'worker-2', age: 100, idle: 0 },
      ],
    });

    const res = await app.request('/v1/queues/sync/workers', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ id: 'w-1', addr: '127.0.0.1:6379', name: 'worker-1', age: 42, idle: 5 });
    expect(json[1]).toEqual({ id: 'w-2', addr: '127.0.0.1:6380', name: 'worker-2', age: 100, idle: 0 });
  });

  it('returns empty workers array when no workers connected', async () => {
    mockQueueService.listWorkers.mockResolvedValue({ data: [] });

    const res = await app.request('/v1/queues/sync/workers', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns 404 for unknown queue name', async () => {
    mockQueueService.listWorkers.mockResolvedValue({ error: 'Queue not found' });

    const res = await app.request('/v1/queues/unknown/workers', { method: 'GET' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── GET /v1/queues/:name/jobs ─────────────────────────────────────────

describe('GET /v1/queues/:name/jobs', () => {
  it('returns jobs with serialized fields', async () => {
    mockQueueService.listJobs.mockResolvedValue({
      data: [
        {
          id: 'job-42',
          name: 'ingest',
          data: { some: 'data' },
          state: 'completed',
          attemptsMade: 1,
          timestamp: 1700000000000,
          processedOn: 1700000001000,
          finishedOn: 1700000002000,
          failedReason: null,
          returnvalue: { result: 'ok' },
          stacktrace: [],
          progress: 100,
        },
      ],
    });

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

  it('passes state, start, and pageSize to service', async () => {
    mockQueueService.listJobs.mockResolvedValue({ data: [] });

    await app.request('/v1/queues/sync/jobs?state=failed&start=10&pageSize=25', { method: 'GET' });

    expect(mockQueueService.listJobs).toHaveBeenCalledWith('sync', 'failed', 10, 25);
  });

  it('uses defaults for state, start, and pageSize', async () => {
    mockQueueService.listJobs.mockResolvedValue({ data: [] });

    await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    expect(mockQueueService.listJobs).toHaveBeenCalledWith('sync', 'all', 0, 50);
  });

  it('returns empty array when queue has no jobs', async () => {
    mockQueueService.listJobs.mockResolvedValue({ data: [] });

    const res = await app.request('/v1/queues/sync/jobs', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it('returns 404 for unknown queue', async () => {
    mockQueueService.listJobs.mockResolvedValue({ error: 'Queue not found' });

    const res = await app.request('/v1/queues/unknown/jobs', { method: 'GET' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── POST /v1/queues/:name/pause ──────────────────────────────────────

describe('POST /v1/queues/:name/pause', () => {
  it('calls pauseQueue and returns { ok: true }', async () => {
    const res = await app.request('/v1/queues/sync/pause', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockQueueService.pauseQueue).toHaveBeenCalledWith('sync');
  });

  it('returns 404 for unknown queue', async () => {
    mockQueueService.pauseQueue.mockResolvedValue({ error: 'Queue not found' });

    const res = await app.request('/v1/queues/unknown/pause', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── POST /v1/queues/:name/resume ─────────────────────────────────────

describe('POST /v1/queues/:name/resume', () => {
  it('calls resumeQueue and returns { ok: true }', async () => {
    const res = await app.request('/v1/queues/sync/resume', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockQueueService.resumeQueue).toHaveBeenCalledWith('sync');
  });

  it('returns 404 for unknown queue', async () => {
    mockQueueService.resumeQueue.mockResolvedValue({ error: 'Queue not found' });

    const res = await app.request('/v1/queues/unknown/resume', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── POST /v1/queues/:name/clean ──────────────────────────────────────

describe('POST /v1/queues/:name/clean', () => {
  it('calls cleanQueue with correct args and returns { ok, removed }', async () => {
    mockQueueService.cleanQueue.mockResolvedValue({ data: { ok: true, removed: 3 } });

    const res = await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'completed', grace: 5000, limit: 100 }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, removed: 3 });
    expect(mockQueueService.cleanQueue).toHaveBeenCalledWith('sync', { state: 'completed', grace: 5000, limit: 100 });
  });

  it('uses default grace=0 and limit=1000 when not provided', async () => {
    mockQueueService.cleanQueue.mockResolvedValue({ data: { ok: true, removed: 0 } });

    await app.request('/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'failed' }),
    });

    expect(mockQueueService.cleanQueue).toHaveBeenCalledWith('sync', { state: 'failed', grace: 0, limit: 1000 });
  });

  it('accepts all valid state enum values', async () => {
    mockQueueService.cleanQueue.mockResolvedValue({ data: { ok: true, removed: 0 } });

    for (const state of ['completed', 'failed', 'delayed', 'wait']) {
      // oxlint-disable-next-line no-await-in-loop -- test: sequential validation of each state
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
    mockQueueService.cleanQueue.mockResolvedValue({ error: 'Queue not found' });

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
    mockQueueService.retryJob.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/queues/sync/jobs/job-1/retry', { method: 'POST' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockQueueService.retryJob).toHaveBeenCalledWith('sync', 'job-1');
  });

  it('returns 400 when job is not in failed state', async () => {
    mockQueueService.retryJob.mockResolvedValue({ error: 'Cannot retry job in state "completed" — must be failed' });

    const res = await app.request('/v1/queues/sync/jobs/job-2/retry', { method: 'POST' });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/completed/);
  });

  it('returns 400 when job is in active state', async () => {
    mockQueueService.retryJob.mockResolvedValue({ error: 'Cannot retry job in state "active" — must be failed' });

    const res = await app.request('/v1/queues/sync/jobs/job-3/retry', { method: 'POST' });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/active/);
  });

  it('returns 404 when job is not found', async () => {
    mockQueueService.retryJob.mockResolvedValue({ error: 'Job not found' });

    const res = await app.request('/v1/queues/sync/jobs/missing-job/retry', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Job not found');
  });

  it('returns 404 for unknown queue', async () => {
    mockQueueService.retryJob.mockResolvedValue({ error: 'Queue not found' });

    const res = await app.request('/v1/queues/unknown/jobs/job-1/retry', { method: 'POST' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── DELETE /v1/queues/:name/jobs/:jobId ──────────────────────────────

describe('DELETE /v1/queues/:name/jobs/:jobId', () => {
  it('returns { ok: true } for a non-active job', async () => {
    mockQueueService.removeJob.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/queues/sync/jobs/job-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockQueueService.removeJob).toHaveBeenCalledWith('sync', 'job-1');
  });

  it('returns 409 when job is in active state', async () => {
    mockQueueService.removeJob.mockResolvedValue({
      error: 'Cannot remove an active job. Wait for it to finish or stop the worker.',
    });

    const res = await app.request('/v1/queues/sync/jobs/job-active', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/active/i);
  });

  it('returns 409 when job removal fails', async () => {
    mockQueueService.removeJob.mockResolvedValue({ error: 'Cannot remove: already locked' });

    const res = await app.request('/v1/queues/sync/jobs/job-locked', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Cannot remove: already locked');
  });

  it('returns 409 with generic message when removal fails', async () => {
    mockQueueService.removeJob.mockResolvedValue({ error: 'Failed to remove job' });

    const res = await app.request('/v1/queues/sync/jobs/job-err', { method: 'DELETE' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Failed to remove job');
  });

  it('returns 404 when job is not found', async () => {
    mockQueueService.removeJob.mockResolvedValue({ error: 'Job not found' });

    const res = await app.request('/v1/queues/sync/jobs/missing-job', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Job not found');
  });

  it('returns 404 for unknown queue', async () => {
    mockQueueService.removeJob.mockResolvedValue({ error: 'Queue not found' });

    const res = await app.request('/v1/queues/unknown/jobs/job-1', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Queue not found');
  });
});

// ── GET /v1/queues/failed-jobs ──────────────────────────────────────

describe('GET /v1/queues/failed-jobs', () => {
  it('returns list of failed jobs', async () => {
    mockQueueService.listFailedJobs.mockResolvedValue({ data: [{ id: 'fj-1', queue: 'sync', jobName: 'scan' }] });

    const res = await app.request('/v1/queues/failed-jobs', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe('fj-1');
  });

  it('returns empty list when no failed jobs', async () => {
    mockQueueService.listFailedJobs.mockResolvedValue({ data: [] });

    const res = await app.request('/v1/queues/failed-jobs', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

// ── GET /v1/queues/failed-jobs/:id ──────────────────────────────────

describe('GET /v1/queues/failed-jobs/:id', () => {
  it('returns a specific failed job', async () => {
    mockQueueService.getFailedJob.mockResolvedValue({ data: { id: 'fj-1', queue: 'sync' } });

    const res = await app.request('/v1/queues/failed-jobs/fj-1', { method: 'GET' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('fj-1');
  });

  it('returns 404 when not found', async () => {
    mockQueueService.getFailedJob.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/queues/failed-jobs/missing', { method: 'GET' });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /v1/queues/failed-jobs/:id ───────────────────────────────

describe('DELETE /v1/queues/failed-jobs/:id', () => {
  it('deletes a failed job and returns ok', async () => {
    mockQueueService.deleteFailedJob.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/queues/failed-jobs/fj-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});

// ── GET /v1/queues/events (SSE) ─────────────────────────────────────

describe('GET /v1/queues/events', () => {
  it('returns text/event-stream content type', async () => {
    const res = await app.request('/v1/queues/events', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('sends initial ping with retry directive', async () => {
    const res = await app.request('/v1/queues/events', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(res.body).not.toBeNull();
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- body existence asserted above
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('event: ping');
    expect(text).toContain('retry: 5000');
    reader.cancel();
  });

  it('streams queue events to the client', async () => {
    // Capture the event listener registered on the bus
    let eventHandler: ((payload: { queue: string; type: string }) => void) | undefined;
    mockQueueEventBus.on.mockImplementation((_event: string, handler: (...args: unknown[]) => void) => {
      eventHandler = handler as typeof eventHandler;
    });

    const res = await app.request('/v1/queues/events', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(res.body).not.toBeNull();
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- body existence asserted above
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial ping
    await reader.read();

    // Emit a queue event
    expect(eventHandler).toBeDefined();
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion -- handler existence asserted above
    eventHandler!({ queue: 'sync', type: 'completed' });

    // Read the event
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('event: queue-event');
    expect(text).toContain('"queue":"sync"');
    expect(text).toContain('"type":"completed"');
    reader.cancel();
  });

  it('registers an event bus listener on connect', async () => {
    await app.request('/v1/queues/events', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(mockQueueEventBus.on).toHaveBeenCalledWith('event', expect.any(Function));
  });
});
