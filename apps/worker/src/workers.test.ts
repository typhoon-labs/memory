import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture Worker constructor args and instances for inspection
const { mockWorkerInstances, mockWorkerClose } = vi.hoisted(() => {
  const mockWorkerInstances: Array<{
    queueName: string;
    processor: (job: unknown, token?: string) => Promise<unknown>;
    opts: Record<string, unknown>;
    events: Record<string, Array<(...args: unknown[]) => void>>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const mockWorkerClose = vi.fn().mockResolvedValue(undefined);

  return { mockWorkerInstances, mockWorkerClose };
});

vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UnrecoverableError';
    }
  },
  WaitingChildrenError: class WaitingChildrenError extends Error {
    constructor() {
      super('WaitingChildrenError');
      this.name = 'WaitingChildrenError';
    }
  },
  FlowProducer: class MockFlowProducer {
    add = vi.fn().mockResolvedValue({ job: { id: 'flow-1' } });
  },
  Worker: class MockWorker {
    queueName: string;
    processor: (job: unknown, token?: string) => Promise<unknown>;
    opts: Record<string, unknown>;
    events: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor(
      queueName: string,
      processor: (job: unknown, token?: string) => Promise<unknown>,
      opts: Record<string, unknown>,
    ) {
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

const mockPrepareScoring = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    messageId: 'msg-1',
    userQuestion: 'test?',
    responseText: 'answer',
    context: ['ctx'],
    scorersToRun: [
      {
        id: 'answerRelevancy',
        name: 'answerRelevancy',
        type: 'answerRelevancy',
        description: null,
        model: null,
        instructions: null,
        scoreRange: null,
        presetConfig: null,
        defaultSampling: null,
      },
    ],
    skippedCount: 0,
    contextSkippedScorers: [],
  }),
);

const mockRunSingleScorer = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ scorerId: 'answerRelevancy', score: 0.9, reason: 'ok' }),
);

vi.mock('@typhoon/agents', () => ({
  createExperimentAgent: vi.fn(() => ({ generate: vi.fn() })),
}));

vi.mock('@typhoon/evals', () => ({
  prepareScoring: mockPrepareScoring,
  runSingleScorer: mockRunSingleScorer,
  BUILTIN_SCORER_DEFS: [],
  setupExperiment: vi.fn().mockResolvedValue({ experiment: { id: 'exp-1' }, items: [] }),
  processExperimentItemStep1: vi.fn().mockResolvedValue(null),
  processExperimentItemStep2: vi.fn().mockResolvedValue({ succeeded: true, scorersFailed: 0 }),
  completeExperiment: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, cancelled: false }),
  mapScorerRows: vi.fn(() => []),
  PUBLISHED_SCORERS_QUERY: 'SELECT 1',
  extractContextFromSteps: vi.fn(() => []),
  constructScorer: vi.fn(),
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
  sql: vi.fn(),
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

const { mockSyncQueue, mockReviewsQueue, mockScoringQueue } = vi.hoisted(() => ({
  mockSyncQueue: { add: vi.fn(), close: vi.fn() },
  mockReviewsQueue: { add: vi.fn().mockResolvedValue({}), close: vi.fn() },
  mockScoringQueue: { add: vi.fn().mockResolvedValue({}), close: vi.fn() },
}));

vi.mock('./queue', () => ({
  getSyncQueue: vi.fn(() => mockSyncQueue),
  getReviewsQueue: vi.fn(() => mockReviewsQueue),
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
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  it('creates Workers for sync, reviews, scoring, and experiments queues', () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    expect(mockWorkerInstances.length).toBeGreaterThanOrEqual(1);

    const queueNames = mockWorkerInstances.map((w) => w.queueName);
    expect(queueNames).toContain('sync');
    expect(queueNames).toContain('reviews');
    expect(queueNames).toContain('scoring');
    expect(queueNames).toContain('experiments');
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

  it('throws Error for unknown sync job name', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const processor = mockWorkerInstances[0].processor;
    const fakeJob = { name: 'unknown-name', id: 'j-4', data: {} };
    await expect(processor(fakeJob)).rejects.toThrow('Unknown job: unknown-name');
  });

  it('attaches event handlers to sync worker', () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const { events } = mockWorkerInstances[0];
    expect(events.error).toHaveLength(1);
    expect(events.failed).toHaveLength(1);
    expect(events.completed).toHaveLength(1);
  });
});

describe('reviews worker processor', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  function getReviewsWorker() {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const worker = mockWorkerInstances.find((w) => w.queueName === 'reviews');
    if (!worker) throw new Error('reviews worker not found');
    return worker;
  }

  it('routes "partition-management" job to managePartitions', async () => {
    const { managePartitions } = await import('@typhoon/ingestion');
    const worker = getReviewsWorker();
    const fakeJob = { name: 'partition-management', data: { retentionDays: 30 } };
    await worker.processor(fakeJob);
    expect(managePartitions).toHaveBeenCalledWith(expect.anything(), { retentionDays: 30 });
  });

  it('routes score-message to prepareScoring and creates flow', async () => {
    const worker = getReviewsWorker();
    const fakeJob = {
      name: 'score-message',
      data: { messageId: 'm-1', threadId: 't-1', agentId: 'a-1', traceId: 'tr-1' },
    };
    const result = await worker.processor(fakeJob);
    expect(mockPrepareScoring).toHaveBeenCalled();
    expect(result).toMatchObject({ prepared: 1, skipped: 0 });
  });

  it('returns early when no scorers to run', async () => {
    mockPrepareScoring.mockResolvedValueOnce({
      messageId: 'msg-1',
      userQuestion: 'test?',
      responseText: 'answer',
      context: [],
      scorersToRun: [],
      skippedCount: 5,
      contextSkippedScorers: [],
    });
    const worker = getReviewsWorker();
    const fakeJob = {
      name: 'score-message',
      data: { messageId: 'm-1', threadId: 't-1', agentId: 'a-1', traceId: 'tr-1' },
    };
    const result = await worker.processor(fakeJob);
    expect(result).toMatchObject({ scored: 0, skipped: 5 });
  });

  it('wraps unrecoverable errors in UnrecoverableError', async () => {
    mockPrepareScoring.mockRejectedValueOnce(Object.assign(new Error('bad input'), { unrecoverable: true }));
    const worker = getReviewsWorker();
    const fakeJob = {
      name: 'score-message',
      data: { messageId: 'm-1', threadId: 't-1', agentId: 'a-1', traceId: 'tr-1' },
    };
    await expect(worker.processor(fakeJob)).rejects.toThrow('bad input');
  });

  it('routes score-aggregate and collects children values', async () => {
    const worker = getReviewsWorker();
    const fakeJob = {
      name: 'score-aggregate',
      data: { messageId: 'msg-1', threadId: 't-1', totalScorers: 5, skippedScorers: 0 },
      getChildrenValues: vi.fn().mockResolvedValue({ 'key-1': { score: 0.9 }, 'key-2': { score: 0.8 } }),
      getFailedChildrenValues: vi.fn().mockResolvedValue({}),
    };
    const result = await worker.processor(fakeJob);
    expect(result).toMatchObject({ scored: 2, skipped: 0, failed: 0 });
  });
});

describe('scoring worker processor', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  function getScoringRunWorker() {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const worker = mockWorkerInstances.find((w) => w.queueName === 'scoring');
    if (!worker) throw new Error('scoring worker not found');
    return worker;
  }

  it('routes score-run to runSingleScorer', async () => {
    const worker = getScoringRunWorker();
    const fakeJob = {
      name: 'score-run',
      data: {
        scorerName: 'answerRelevancy',
        scorerDefinition: { name: 'answerRelevancy', type: 'answerRelevancy' },
        userQuestion: 'test?',
        responseText: 'answer',
        context: [],
      },
    };
    const result = await worker.processor(fakeJob);
    expect(mockRunSingleScorer).toHaveBeenCalled();
    expect(result).toMatchObject({ scorerId: 'answerRelevancy', score: 0.9 });
  });

  it('throws for unknown job type', async () => {
    const worker = getScoringRunWorker();
    const fakeJob = { name: 'unknown', data: {} };
    await expect(worker.processor(fakeJob)).rejects.toThrow('Unknown scoring job type');
  });
});

describe('experiment worker processor', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  function getExperimentsWorker() {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const worker = mockWorkerInstances.find((w) => w.queueName === 'experiments');
    if (!worker) throw new Error('experiments worker not found');
    return worker;
  }

  it('routes experiment-setup to setupExperiment', async () => {
    const { setupExperiment } = await import('@typhoon/evals');
    const worker = getExperimentsWorker();
    const fakeJob = { name: 'experiment-setup', data: { experimentId: 'exp-1' } };
    await worker.processor(fakeJob);
    expect(setupExperiment).toHaveBeenCalledWith('exp-1', expect.anything());
  });

  it('routes experiment-complete to completeExperiment', async () => {
    const { completeExperiment } = await import('@typhoon/evals');
    const worker = getExperimentsWorker();
    const fakeJob = {
      name: 'experiment-complete',
      data: { experimentId: 'exp-1', totalItems: 3 },
      getChildrenValues: vi.fn().mockResolvedValue({}),
      getFailedChildrenValues: vi.fn().mockResolvedValue({}),
    };
    await worker.processor(fakeJob);
    expect(completeExperiment).toHaveBeenCalled();
  });
});

describe('sync worker event handlers', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
    mockWorkerClose.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownWorkers();
    mockWorkerInstances.length = 0;
  });

  it('calls incrementSyncJobCompletion on failed job with syncJobId', async () => {
    const { incrementSyncJobCompletion } = await import('@typhoon/ingestion');
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const syncWorker = mockWorkerInstances.find((w) => w.queueName === 'sync');
    if (!syncWorker) throw new Error('sync worker not found');
    const failedHandler = syncWorker.events.failed[0];
    failedHandler({ name: 'process-file', id: 'j-1', data: { syncJobId: 'sj-1' } }, new Error('fail'));
    expect(incrementSyncJobCompletion).toHaveBeenCalledWith(expect.anything(), 'sj-1', true);
  });

  it('does not call incrementSyncJobCompletion when syncJobId is absent', async () => {
    const { incrementSyncJobCompletion } = await import('@typhoon/ingestion');
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    const syncWorker = mockWorkerInstances.find((w) => w.queueName === 'sync');
    if (!syncWorker) throw new Error('sync worker not found');
    const failedHandler = syncWorker.events.failed[0];
    failedHandler({ name: 'scan', id: 'j-1', data: {} }, new Error('fail'));
    expect(incrementSyncJobCompletion).not.toHaveBeenCalled();
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
    await expect(shutdownWorkers()).resolves.toBeUndefined();
  });

  it('calls close() on all workers', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    await shutdownWorkers();
    // close() called for sync + reviews + scoring + experiments workers
    expect(mockWorkerClose).toHaveBeenCalledTimes(4);
  });

  it('clears the tracked workers after shutdown', async () => {
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    await shutdownWorkers();
    mockWorkerClose.mockClear();
    await shutdownWorkers();
    expect(mockWorkerClose).not.toHaveBeenCalled();
  });

  it('respects the gracefulMs timeout via Promise.race', async () => {
    mockWorkerClose.mockReturnValue(new Promise(() => {}));
    startWorkers('redis://localhost:6379', 'postgresql://localhost/typhoon');
    await expect(shutdownWorkers({ gracefulMs: 10 })).resolves.toBeUndefined();
  });
});
