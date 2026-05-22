import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'UnrecoverableError';
    }
  },
}));

vi.mock('@typhoon/evals', () => ({
  runSingleScorer: vi.fn(),
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { runSingleScorer } from '@typhoon/evals';

import { createScoringWorker } from './scoring.worker';
import type { ScoringWorkerDeps } from './types';

describe('createScoringWorker', () => {
  let deps: ScoringWorkerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      redis: {
        createWorker: (...args: unknown[]) => {
          mockWorkerConstructor(...args);
          return mockWorkerInstance;
        },
      } as unknown as ScoringWorkerDeps['redis'],
      createScoringModel: (() => ({})) as unknown as ScoringWorkerDeps['createScoringModel'],
      scoringDeps: {
        hasExistingScore: vi.fn(),
        saveScore: vi.fn(),
      } as unknown as ScoringWorkerDeps['scoringDeps'],
    };
  });

  it('creates a BullMQ Worker for the scoring queue', () => {
    createScoringWorker(deps);

    expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'scoring',
      expect.any(Function),
      expect.objectContaining({
        concurrency: expect.any(Number),
      }),
    );
  });

  it('returns the worker instance', () => {
    const worker = createScoringWorker(deps);
    expect(worker).toBe(mockWorkerInstance);
  });

  it('registers error, failed, and completed event listeners', () => {
    createScoringWorker(deps);
    const onCalls = mockWorkerInstance.on.mock.calls.map((call) => call[0]);
    expect(onCalls).toContain('error');
    expect(onCalls).toContain('failed');
    expect(onCalls).toContain('completed');
  });

  it('configures lock and stalled options', () => {
    createScoringWorker(deps);
    const workerOpts = mockWorkerConstructor.mock.calls[0][2];
    expect(workerOpts.lockDuration).toBe(5 * 60 * 1000);
    expect(workerOpts.stalledInterval).toBe(150_000);
    expect(workerOpts.maxStalledCount).toBe(2);
  });

  describe('job processor', () => {
    let processor: (job: Record<string, unknown>) => Promise<unknown>;

    beforeEach(() => {
      createScoringWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('throws for unknown job types', async () => {
      const job = { name: 'unknown', data: {} };
      await expect(processor(job)).rejects.toThrow('Unknown scoring job type: unknown');
    });

    it('calls runSingleScorer for score-run jobs', async () => {
      vi.mocked(runSingleScorer).mockResolvedValue({ score: 0.9 } as never);
      const job = {
        name: 'score-run',
        data: {
          scorerDefinition: { name: 'test' },
          userQuestion: 'Q?',
          responseText: 'A.',
          context: ['ctx'],
          persist: { messageId: 'msg-1' },
        },
      };
      const result = await processor(job);
      expect(runSingleScorer).toHaveBeenCalled();
      expect(result).toEqual({ score: 0.9 });
    });

    it('wraps unrecoverable errors', async () => {
      const err = Object.assign(new Error('bad scorer'), { unrecoverable: true });
      vi.mocked(runSingleScorer).mockRejectedValue(err);
      const job = {
        name: 'score-run',
        data: {
          scorerDefinition: { name: 'test' },
          userQuestion: 'Q?',
          responseText: 'A.',
          context: [],
          persist: {},
        },
      };
      await expect(processor(job)).rejects.toThrow('bad scorer');
    });
  });

  describe('event listeners', () => {
    it('error listener logs without throwing', () => {
      createScoringWorker(deps);
      const errorHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(() => errorHandler(new Error('test'))).not.toThrow();
    });

    it('failed listener logs without throwing', () => {
      createScoringWorker(deps);
      const failedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'failed')?.[1];
      expect(() => failedHandler({ id: 'j1', name: 'score-run' }, new Error('fail'))).not.toThrow();
    });

    it('completed listener logs without throwing', () => {
      createScoringWorker(deps);
      const completedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'completed')?.[1];
      expect(() => completedHandler({ id: 'j1', returnvalue: {} })).not.toThrow();
    });
  });
});
