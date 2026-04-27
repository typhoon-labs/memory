import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture Worker constructor args and instances for inspection
const { mockWorkerInstances, mockWorkerClose } = vi.hoisted(() => {
  const mockWorkerInstances: Array<{
    queueName: string;
    processor: (job: unknown) => Promise<unknown>;
    opts: Record<string, unknown>;
    events: Record<string, Array<(...args: unknown[]) => void>>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

  return { mockWorkerInstances, mockWorkerClose };
});

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    queueName: string;
    processor: (job: unknown) => Promise<unknown>;
    opts: Record<string, unknown>;
    events: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor(queueName: string, processor: (job: unknown) => Promise<unknown>, opts: Record<string, unknown>) {
      this.queueName = queueName;
      this.processor = processor;
      this.opts = opts;
      mockWorkerInstances.push(this as never);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(handler);
    }

    close = mockWorkerClose;
  },
}));

const { mockHandleScanJob, mockHandleProcessFileJob, mockHandleDeleteFileJob } = vi.hoisted(() => ({
  mockHandleScanJob: vi.fn().mockResolvedValue(undefined),
  mockHandleProcessFileJob: vi.fn().mockResolvedValue(undefined),
  mockHandleDeleteFileJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@typhoon/ingestion', () => ({
  handleScanJob: mockHandleScanJob,
  handleProcessFileJob: mockHandleProcessFileJob,
  handleDeleteFileJob: mockHandleDeleteFileJob,
  incrementSyncJobCompletion: vi.fn().mockResolvedValue(undefined),
  managePartitions: vi.fn().mockResolvedValue({ created: [], dropped: [] }),
}));

vi.mock('@typhoon/agents', () => ({
  scoreMessage: vi.fn().mockResolvedValue({ scored: 5, skipped: 0, errors: [] }),
  createExperimentAgent: vi.fn(() => ({ generate: vi.fn() })),
  handleExperimentJob: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, cancelled: false }),
}));

vi.mock('@typhoon/ai', () => ({
  createScoringModel: vi.fn(() => 'mock-scoring-model'),
}));

vi.mock('@typhoon/config', () => ({
  isScoringEnabled: vi.fn(() => true),
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class MockPgVector {},
  DrizzleDatasetsStorage: class MockDatasetsStorage {
    getItemsByVersion = vi.fn().mockResolvedValue([]);
  },
  DrizzleExperimentsStorage: class MockExperimentsStorage {
    updateExperiment = vi.fn().mockResolvedValue({});
    addExperimentResult = vi.fn().mockResolvedValue({});
  },
}));

vi.mock('@typhoon/db', () => ({
  createDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  })),
  messages: {},
  threads: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@mastra/core', () => ({
  Mastra: class MockMastra {
    getAgent(id: string) {
      return { id, generate: vi.fn() };
    }
  },
}));

vi.mock('postgres', () => ({
  default: vi.fn(() => ({
    unsafe: vi.fn().mockResolvedValue([]),
  })),
}));

const { mockSyncQueue, mockScoringQueue } = vi.hoisted(() => ({
  mockSyncQueue: { add: vi.fn(), close: vi.fn() },
  mockScoringQueue: { add: vi.fn().mockResolvedValue({}), close: vi.fn() },
}));

vi.mock('./queue', () => ({
  getSyncQueue: vi.fn(() => mockSyncQueue),
  getScoringQueue: vi.fn(() => mockScoringQueue),
}));

// Import after mocks are registered
import { shutdownWorkers, startWorkers } from './workers';

const ENV_KEYS = [
  'SYNC_WORKER_CONCURRENCY',
  'SYNC_WORKER_LOCK_DURATION_MS',
  'SYNC_WORKER_STALLED_INTERVAL_MS',
  'SYNC_WORKER_MAX_STALLED_COUNT',
] as const;

describe('startWorkers', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot env vars that tests may mutate
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore env vars — runs even if a test assertion fails
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    // Always shut down so _workers module-level state is cleared between tests
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  it('creates Workers for "sync" and "scoring" queues', () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    expect(mockWorkerInstances.length).toBeGreaterThanOrEqual(1);
    expect(mockWorkerInstances[0].queueName).toBe('sync');
    // Scoring worker is also created when isScoringEnabled() returns true
    const scoringWorker = mockWorkerInstances.find((w) => w.queueName === 'scoring');
    expect(scoringWorker).toBeDefined();
  });

  it('returns syncWorker and syncQueue', () => {
    const result = startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    expect(result.syncWorker).toBeDefined();
    expect(result.syncQueue).toBe(mockSyncQueue);
  });

  it('uses default config: concurrency=5, lockDuration=120000, stalledInterval=60000, maxStalledCount=3', () => {
    delete process.env.SYNC_WORKER_CONCURRENCY;
    delete process.env.SYNC_WORKER_LOCK_DURATION_MS;
    delete process.env.SYNC_WORKER_STALLED_INTERVAL_MS;
    delete process.env.SYNC_WORKER_MAX_STALLED_COUNT;

    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const opts = mockWorkerInstances[0].opts;
    expect(opts.concurrency).toBe(5);
    expect(opts.lockDuration).toBe(120_000);
    expect(opts.stalledInterval).toBe(60_000);
    expect(opts.maxStalledCount).toBe(3);
  });

  it('reads SYNC_WORKER_CONCURRENCY env var to override concurrency', async () => {
    process.env.SYNC_WORKER_CONCURRENCY = '3';
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    expect(mockWorkerInstances[0].opts.concurrency).toBe(3);
  });

  it('reads SYNC_WORKER_LOCK_DURATION_MS env var to override lockDuration', () => {
    process.env.SYNC_WORKER_LOCK_DURATION_MS = '60000';
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    expect(mockWorkerInstances[0].opts.lockDuration).toBe(60_000);
  });

  it('routes "scan" job to handleScanJob with (job, db, queue)', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const processor = mockWorkerInstances[0].processor;
    const fakeJob = { name: 'scan', id: 'j-1', data: {} };
    await processor(fakeJob);
    expect(mockHandleScanJob).toHaveBeenCalledWith(fakeJob, expect.anything(), mockSyncQueue);
  });

  it('routes "process-file" job to handleProcessFileJob with (job, db, vectorStore)', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const processor = mockWorkerInstances[0].processor;
    const fakeJob = { name: 'process-file', id: 'j-2', data: {} };
    await processor(fakeJob);
    expect(mockHandleProcessFileJob).toHaveBeenCalledWith(fakeJob, expect.anything(), expect.anything());
  });

  it('routes "delete-file" job to handleDeleteFileJob with (job, db, vectorStore)', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const processor = mockWorkerInstances[0].processor;
    const fakeJob = { name: 'delete-file', id: 'j-3', data: {} };
    await processor(fakeJob);
    expect(mockHandleDeleteFileJob).toHaveBeenCalledWith(fakeJob, expect.anything(), expect.anything());
  });

  it('throws Error for unknown job name', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const processor = mockWorkerInstances[0].processor;
    const fakeJob = { name: 'unknown-name', id: 'j-4', data: {} };
    await expect(processor(fakeJob)).rejects.toThrow('Unknown job: unknown-name');
  });

  it('attaches "error", "failed", and "completed" event handlers', () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const { events } = mockWorkerInstances[0];
    expect(events.error).toHaveLength(1);
    expect(events.failed).toHaveLength(1);
    expect(events.completed).toHaveLength(1);
  });
});

describe('shutdownWorkers', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  it('is a no-op when no workers have been started', async () => {
    // Should not throw even with empty _workers
    await expect(shutdownWorkers()).resolves.toBeUndefined();
  });

  it('calls close() on all workers', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    await shutdownWorkers();
    // close() called for sync + scoring + experiments workers
    expect(mockWorkerClose).toHaveBeenCalledTimes(3);
  });

  it('clears the tracked workers after shutdown', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    await shutdownWorkers();
    // Calling again should be no-op (workers cleared)
    mockWorkerClose.mockClear();
    await shutdownWorkers();
    expect(mockWorkerClose).not.toHaveBeenCalled();
  });

  it('respects the gracefulMs timeout via Promise.race', async () => {
    // Make worker.close() hang forever
    mockWorkerClose.mockReturnValue(new Promise(() => {}));
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    // With a very short gracefulMs the race resolves via the timeout
    await expect(shutdownWorkers({ gracefulMs: 10 })).resolves.toBeUndefined();
  });
});
