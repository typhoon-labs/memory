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

vi.mock('@typhoon/db/repos', () => ({
  PartitionRepo: class {
    constructor() {}
  },
}));

vi.mock('@typhoon/evals', () => ({
  prepareScoring: vi.fn(),
}));

vi.mock('@typhoon/ingestion', () => ({}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { prepareScoring } from '@typhoon/evals';

import { createReviewsWorker } from './reviews.worker';
import type { ReviewsWorkerDeps } from './types';

describe('createReviewsWorker', () => {
  let deps: ReviewsWorkerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      redis: {
        createWorker: (...args: unknown[]) => {
          mockWorkerConstructor(...args);
          return mockWorkerInstance;
        },
      } as unknown as ReviewsWorkerDeps['redis'],
      db: {} as ReviewsWorkerDeps['db'],
      createScoringModel: (() => ({})) as unknown as ReviewsWorkerDeps['createScoringModel'],
      scoringDeps: {
        hasExistingScore: vi.fn(),
        saveScore: vi.fn(),
      } as unknown as ReviewsWorkerDeps['scoringDeps'],
      flowProducer: { add: vi.fn() } as unknown as ReviewsWorkerDeps['flowProducer'],
      reviewsQueue: { add: vi.fn().mockResolvedValue({}) } as unknown as ReviewsWorkerDeps['reviewsQueue'],
      refreshScorerDefinitions: vi.fn().mockResolvedValue(undefined),
      getCachedScorerDefs: vi.fn().mockReturnValue([]),
    };
  });

  it('creates a BullMQ Worker for the reviews queue', () => {
    createReviewsWorker(deps);

    expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'reviews',
      expect.any(Function),
      expect.objectContaining({
        concurrency: expect.any(Number),
      }),
    );
  });

  it('returns the worker instance', () => {
    const worker = createReviewsWorker(deps);
    expect(worker).toBe(mockWorkerInstance);
  });

  it('registers error, failed, and completed event listeners', () => {
    createReviewsWorker(deps);
    const onCalls = mockWorkerInstance.on.mock.calls.map((call) => call[0]);
    expect(onCalls).toContain('error');
    expect(onCalls).toContain('failed');
    expect(onCalls).toContain('completed');
  });

  describe('job processor', () => {
    let processor: (job: Record<string, unknown>) => Promise<unknown>;

    beforeEach(() => {
      createReviewsWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('handles score-message with no scorers to run', async () => {
      vi.mocked(prepareScoring).mockResolvedValue({
        messageId: 'msg-1',
        userQuestion: 'Q?',
        responseText: 'A.',
        context: [],
        scorersToRun: [],
        skippedCount: 2,
      } as never);
      const job = {
        name: 'score-message',
        data: { messageId: 'msg-1', threadId: 'th-1', agentId: 'agent-1', traceId: 'tr-1' },
      };
      const result = await processor(job);
      expect(result).toEqual({ scored: 0, skipped: 2, errors: [] });
    });

    it('handles score-message with scorers to run (creates flow)', async () => {
      vi.mocked(prepareScoring).mockResolvedValue({
        messageId: 'msg-1',
        userQuestion: 'Q?',
        responseText: 'A.',
        context: ['ctx'],
        scorersToRun: [{ name: 'faithfulness', type: 'faithfulness' } as never],
        skippedCount: 1,
      } as never);
      const job = {
        name: 'score-message',
        data: { messageId: 'msg-1', threadId: 'th-1', agentId: 'agent-1', traceId: 'tr-1' },
      };
      const result = await processor(job);
      expect((deps.flowProducer as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'score-aggregate',
          queueName: 'reviews',
        }),
      );
      expect(result).toEqual({ prepared: 1, skipped: 1 });
    });

    it('handles score-aggregate job', async () => {
      const job = {
        name: 'score-aggregate',
        data: { messageId: 'msg-1', threadId: 'th-1', totalScorers: 3, skippedScorers: 1 },
        getChildrenValues: vi.fn().mockResolvedValue({ j1: {}, j2: {} }),
        getFailedChildrenValues: vi.fn().mockResolvedValue({}),
      };
      const result = await processor(job);
      expect(result).toEqual({ scored: 2, skipped: 1, failed: 0 });
    });

    it('handles score-aggregate with partial failures', async () => {
      const job = {
        name: 'score-aggregate',
        data: { messageId: 'msg-1', threadId: 'th-1', totalScorers: 3, skippedScorers: 0 },
        getChildrenValues: vi.fn().mockResolvedValue({ j1: {} }),
        getFailedChildrenValues: vi.fn().mockResolvedValue({ j2: 'timeout', j3: 'error' }),
      };
      const result = await processor(job);
      expect(result).toEqual({ scored: 1, skipped: 0, failed: 2 });
    });

    it('throws for unknown job types', async () => {
      const job = { name: 'unknown-type', data: {} };
      await expect(processor(job)).rejects.toThrow('Unknown reviews job type: unknown-type');
    });
  });

  describe('event listeners', () => {
    it('error listener logs without throwing', () => {
      createReviewsWorker(deps);
      const errorHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(() => errorHandler(new Error('test'))).not.toThrow();
    });

    it('failed listener logs without throwing', () => {
      createReviewsWorker(deps);
      const failedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'failed')?.[1];
      expect(() => failedHandler({ id: 'j1', name: 'score-message' }, new Error('fail'))).not.toThrow();
    });
  });
});
