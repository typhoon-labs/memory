import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ───────────────────────────────────────────────

const { mockWorkerInstance, mockWorkerConstructor } = vi.hoisted(() => {
  const mockWorkerInstance = {
    on: vi.fn(),
    close: vi.fn(),
  };
  const mockWorkerConstructor = vi.fn();
  return { mockWorkerInstance, mockWorkerConstructor };
});

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor(...args: unknown[]) {
      mockWorkerConstructor(...args);
      return mockWorkerInstance;
    }
  },
  WaitingChildrenError: class WaitingChildrenError extends Error {
    constructor() {
      super('WaitingChildrenError');
      this.name = 'WaitingChildrenError';
    }
  },
}));

vi.mock('@mastra/core', () => ({
  Mastra: class MockMastra {
    constructor() {}
    getAgent() {
      return { generate: vi.fn().mockResolvedValue({ text: 'response', steps: [] }) };
    }
  },
}));

vi.mock('@typhoon/agents', () => ({
  createSupervisor: vi.fn().mockReturnValue({}),
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  DrizzleDatasetsStorage: class {
    constructor() {}
  },
  DrizzleExperimentsStorage: class {
    constructor() {}
  },
}));

vi.mock('@typhoon/db/repos', () => ({
  ExperimentRepo: class {
    constructor() {}
    findById = vi.fn();
    incrementSucceeded = vi.fn();
    incrementFailed = vi.fn();
  },
}));

vi.mock('@typhoon/evals', () => ({
  BUILTIN_SCORER_DEFS: [],
  setupExperiment: vi.fn(),
  processExperimentItemStep1: vi.fn(),
  processExperimentItemStep2: vi.fn(),
  completeExperiment: vi.fn(),
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createExperimentsWorker } from './experiments.worker';
import type { ExperimentsWorkerDeps } from './types';

// ── Tests ───────────────────────────────────────────────────────

describe('createExperimentsWorker', () => {
  let deps: ExperimentsWorkerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      redis: {
        createWorker: (...args: unknown[]) => {
          mockWorkerConstructor(...args);
          return mockWorkerInstance;
        },
      } as unknown as ExperimentsWorkerDeps['redis'],
      db: {} as ExperimentsWorkerDeps['db'],
      vectorStore: {} as ExperimentsWorkerDeps['vectorStore'],
      createScoringModel: (() => ({})) as unknown as ExperimentsWorkerDeps['createScoringModel'],
      flowProducer: { add: vi.fn() } as unknown as ExperimentsWorkerDeps['flowProducer'],
      scoringQueue: { add: vi.fn() } as unknown as ExperimentsWorkerDeps['scoringQueue'],
      refreshScorerDefinitions: vi.fn().mockResolvedValue(undefined),
      getCachedScorerDefs: vi.fn().mockReturnValue([]),
    };
  });

  it('creates a BullMQ Worker for the experiments queue', () => {
    createExperimentsWorker(deps);

    expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'experiments',
      expect.any(Function),
      expect.objectContaining({
        concurrency: expect.any(Number),
      }),
    );
  });

  it('registers error, failed, and completed event listeners', () => {
    createExperimentsWorker(deps);

    const onCalls = mockWorkerInstance.on.mock.calls.map((call) => call[0]);
    expect(onCalls).toContain('error');
    expect(onCalls).toContain('failed');
    expect(onCalls).toContain('completed');
  });

  it('returns the worker instance', () => {
    const worker = createExperimentsWorker(deps);
    expect(worker).toBe(mockWorkerInstance);
  });

  it('configures worker with lock and stalled options', () => {
    createExperimentsWorker(deps);

    const workerOpts = mockWorkerConstructor.mock.calls[0][2];
    expect(workerOpts.lockDuration).toBe(10 * 60 * 1000);
    expect(workerOpts.stalledInterval).toBe(5 * 60 * 1000);
    expect(workerOpts.maxStalledCount).toBe(1);
  });

  it('uses EXPERIMENTS_CONCURRENCY env var when set', () => {
    const original = process.env.EXPERIMENTS_CONCURRENCY;
    process.env.EXPERIMENTS_CONCURRENCY = '7';
    try {
      createExperimentsWorker(deps);
      const workerOpts = mockWorkerConstructor.mock.calls[0][2];
      expect(workerOpts.concurrency).toBe(7);
    } finally {
      if (original === undefined) {
        delete process.env.EXPERIMENTS_CONCURRENCY;
      } else {
        process.env.EXPERIMENTS_CONCURRENCY = original;
      }
    }
  });

  it('defaults concurrency to 3 when env var is not set', () => {
    const original = process.env.EXPERIMENTS_CONCURRENCY;
    delete process.env.EXPERIMENTS_CONCURRENCY;
    try {
      createExperimentsWorker(deps);
      const workerOpts = mockWorkerConstructor.mock.calls[0][2];
      expect(workerOpts.concurrency).toBe(3);
    } finally {
      if (original !== undefined) {
        process.env.EXPERIMENTS_CONCURRENCY = original;
      }
    }
  });

  describe('job processor', () => {
    let processor: (job: Record<string, unknown>, token?: string) => Promise<unknown>;

    beforeEach(() => {
      createExperimentsWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('throws for unknown job types', async () => {
      const job = { name: 'unknown-type', data: {} };
      await expect(processor(job)).rejects.toThrow('Unknown experiments job type: unknown-type');
    });

    it('handles experiment-setup with empty items', async () => {
      const { setupExperiment } = await import('@typhoon/evals');
      vi.mocked(setupExperiment).mockResolvedValueOnce({
        experiment: { id: 'exp-1', status: 'pending', dataset_id: 'ds-1', dataset_version: 1, total_items: 0 },
        items: [],
      });

      const job = { name: 'experiment-setup', data: { experimentId: 'exp-1' } };
      const result = await processor(job);

      expect(result).toEqual({ succeeded: 0, failed: 0, cancelled: false });
    });

    it('handles experiment-setup with items and creates flow', async () => {
      const { setupExperiment } = await import('@typhoon/evals');
      vi.mocked(setupExperiment).mockResolvedValueOnce({
        experiment: { id: 'exp-1', status: 'pending', dataset_id: 'ds-1', dataset_version: 1, total_items: 2 },
        items: [
          { id: 'item-1', input: { question: 'Q1?' } },
          { id: 'item-2', input: { question: 'Q2?' } },
        ],
      });

      const job = { name: 'experiment-setup', data: { experimentId: 'exp-1' } };
      const result = await processor(job);

      expect(deps.refreshScorerDefinitions).toHaveBeenCalled();
      expect((deps.flowProducer as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'experiment-complete',
          queueName: 'experiments',
          data: expect.objectContaining({ experimentId: 'exp-1', totalItems: 2 }),
          children: expect.arrayContaining([
            expect.objectContaining({ name: 'exp-item-process', queueName: 'experiments' }),
          ]),
        }),
      );
      expect(result).toEqual({ itemsEnqueued: 2 });
    });

    it('handles exp-item-process step 1 returning null (cancelled)', async () => {
      const { processExperimentItemStep1 } = await import('@typhoon/evals');
      vi.mocked(processExperimentItemStep1).mockResolvedValueOnce(null);

      const job = {
        name: 'exp-item-process',
        data: {
          experimentId: 'exp-1',
          itemId: 'item-1',
          input: { question: 'Q?' },
          groundTruth: null,
          step: 1,
        },
        id: 'job-1',
        queueQualifiedName: 'bull:experiments',
        updateData: vi.fn(),
        moveToWaitingChildren: vi.fn().mockResolvedValue(false),
        getChildrenValues: vi.fn().mockResolvedValue({}),
        getFailedChildrenValues: vi.fn().mockResolvedValue({}),
      };

      const result = await processor(job, 'token-1');
      expect(result).toEqual({ itemId: 'item-1', succeeded: false, scorersFailed: 0 });
    });

    it('handles experiment-complete job', async () => {
      const { completeExperiment } = await import('@typhoon/evals');
      vi.mocked(completeExperiment).mockResolvedValueOnce({
        succeeded: 3,
        failed: 1,
        cancelled: false,
      });

      const job = {
        name: 'experiment-complete',
        data: { experimentId: 'exp-1', totalItems: 4 },
        getChildrenValues: vi.fn().mockResolvedValue({
          'job-1': { itemId: 'i1', succeeded: true, scorersFailed: 0 },
          'job-2': { itemId: 'i2', succeeded: true, scorersFailed: 0 },
          'job-3': { itemId: 'i3', succeeded: true, scorersFailed: 0 },
        }),
        getFailedChildrenValues: vi.fn().mockResolvedValue({
          'job-4': 'timeout',
        }),
      };

      const result = await processor(job);
      expect(completeExperiment).toHaveBeenCalledWith(
        'exp-1',
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );
      expect(result).toEqual({ succeeded: 3, failed: 1, cancelled: false });
    });
  });

  describe('job processor — step transitions', () => {
    let processor: (job: Record<string, unknown>, token?: string) => Promise<unknown>;

    beforeEach(() => {
      createExperimentsWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('handles exp-item-process step 2 with scorer results', async () => {
      const { processExperimentItemStep2 } = await import('@typhoon/evals');
      vi.mocked(processExperimentItemStep2).mockResolvedValueOnce({
        succeeded: true,
        scorersFailed: 0,
      });

      const job = {
        name: 'exp-item-process',
        data: {
          experimentId: 'exp-1',
          itemId: 'item-1',
          input: { question: 'Q?' },
          groundTruth: null,
          step: 2,
          responseText: 'Agent response',
          contextSkipped: [],
        },
        id: 'job-1',
        queueQualifiedName: 'bull:experiments',
        updateData: vi.fn(),
        moveToWaitingChildren: vi.fn().mockResolvedValue(false),
        getChildrenValues: vi.fn().mockResolvedValue({ 'scorer-1': { scorerId: 's1', score: 0.9, reason: 'Good' } }),
        getFailedChildrenValues: vi.fn().mockResolvedValue({}),
      };

      const result = await processor(job, 'token-1');
      expect(processExperimentItemStep2).toHaveBeenCalled();
      expect(result).toEqual({ itemId: 'item-1', succeeded: true, scorersFailed: 0 });
    });
  });

  describe('event listeners', () => {
    it('error listener logs without throwing', () => {
      createExperimentsWorker(deps);
      const errorHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(errorHandler).toBeDefined();
      // Should not throw when invoked
      expect(() => errorHandler(new Error('test error'))).not.toThrow();
    });

    it('failed listener logs without throwing', () => {
      createExperimentsWorker(deps);
      const failedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'failed')?.[1];
      expect(failedHandler).toBeDefined();
      expect(() => failedHandler({ id: 'job-1', name: 'test' }, new Error('failed'))).not.toThrow();
    });

    it('completed listener logs without throwing', () => {
      createExperimentsWorker(deps);
      const completedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'completed')?.[1];
      expect(completedHandler).toBeDefined();
      expect(() => completedHandler({ id: 'job-1', name: 'test', returnvalue: {} })).not.toThrow();
    });
  });

  describe('job processor — step 1 with moveToWaitingChildren', () => {
    let processor: (job: Record<string, unknown>, token?: string) => Promise<unknown>;

    beforeEach(() => {
      createExperimentsWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('handles step 1 success that transitions to waiting children', async () => {
      const { processExperimentItemStep1 } = await import('@typhoon/evals');
      vi.mocked(processExperimentItemStep1).mockResolvedValueOnce({
        cancelled: false,
        responseText: 'Agent answer',
        scorerResponseText: 'Agent answer',
        question: 'Q?',
        context: ['ctx'],
        chunkSources: [],
        applicableScorers: [{ name: 'faithfulness', type: 'faithfulness' } as never],
        contextSkippedScorers: [],
      } as never);

      const job = {
        name: 'exp-item-process',
        data: {
          experimentId: 'exp-1',
          itemId: 'item-1',
          input: { question: 'Q?' },
          groundTruth: null,
          step: 1,
        },
        id: 'job-1',
        queueQualifiedName: 'bull:experiments',
        updateData: vi.fn(),
        moveToWaitingChildren: vi.fn().mockResolvedValue(true),
        getChildrenValues: vi.fn().mockResolvedValue({}),
        getFailedChildrenValues: vi.fn().mockResolvedValue({}),
      };

      // When moveToWaitingChildren returns true, the processor
      // should throw WaitingChildrenError to pause the job
      const { WaitingChildrenError } = await import('bullmq');
      await expect(processor(job, 'token-1')).rejects.toThrow(WaitingChildrenError);
    });

    it('handles experiment-complete with all failures', async () => {
      const { completeExperiment } = await import('@typhoon/evals');
      vi.mocked(completeExperiment).mockResolvedValueOnce({
        succeeded: 0,
        failed: 3,
        cancelled: false,
      });

      const job = {
        name: 'experiment-complete',
        data: { experimentId: 'exp-1', totalItems: 3 },
        getChildrenValues: vi.fn().mockResolvedValue({}),
        getFailedChildrenValues: vi.fn().mockResolvedValue({
          'job-1': 'error 1',
          'job-2': 'error 2',
          'job-3': 'error 3',
        }),
      };

      const result = await processor(job);
      expect(result).toEqual({ succeeded: 0, failed: 3, cancelled: false });
    });
  });
});
