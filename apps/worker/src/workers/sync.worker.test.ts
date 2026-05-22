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
}));

vi.mock('@typhoon/db/repos', () => ({
  SyncTargetRepo: class {},
  SyncJobRepo: class {},
  DocumentRepo: class {},
  MetadataRepo: class {},
}));

vi.mock('@typhoon/ingestion', () => ({
  handleScanJob: vi.fn(),
  handleProcessFileJob: vi.fn(),
  handleDeleteFileJob: vi.fn(),
  incrementSyncJobCompletion: vi.fn(),
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { handleDeleteFileJob, handleProcessFileJob, handleScanJob } from '@typhoon/ingestion';

import { createSyncWorker } from './sync.worker';
import type { SyncWorkerDeps } from './types';

describe('createSyncWorker', () => {
  let deps: SyncWorkerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      redis: {
        createWorker: (...args: unknown[]) => {
          mockWorkerConstructor(...args);
          return mockWorkerInstance;
        },
      } as unknown as SyncWorkerDeps['redis'],
      db: {} as SyncWorkerDeps['db'],
      sql: {} as SyncWorkerDeps['sql'],
      vectorStore: {} as SyncWorkerDeps['vectorStore'],
      syncQueue: { add: vi.fn() } as unknown as SyncWorkerDeps['syncQueue'],
    };
  });

  it('creates a BullMQ Worker for the sync queue', () => {
    createSyncWorker(deps);

    expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'sync',
      expect.any(Function),
      expect.objectContaining({
        concurrency: expect.any(Number),
      }),
    );
  });

  it('returns the worker instance', () => {
    const worker = createSyncWorker(deps);
    expect(worker).toBe(mockWorkerInstance);
  });

  it('registers error, failed, and completed event listeners', () => {
    createSyncWorker(deps);
    const onCalls = mockWorkerInstance.on.mock.calls.map((call) => call[0]);
    expect(onCalls).toContain('error');
    expect(onCalls).toContain('failed');
    expect(onCalls).toContain('completed');
  });

  describe('job processor', () => {
    let processor: (job: Record<string, unknown>) => Promise<unknown>;

    beforeEach(() => {
      createSyncWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('routes scan jobs to handleScanJob', async () => {
      vi.mocked(handleScanJob).mockResolvedValue({ scanned: 5 } as never);
      const job = { name: 'scan', data: { syncTargetId: 'st-1' } };
      const result = await processor(job);
      expect(handleScanJob).toHaveBeenCalled();
      expect(result).toEqual({ scanned: 5 });
    });

    it('routes process-file jobs to handleProcessFileJob', async () => {
      vi.mocked(handleProcessFileJob).mockResolvedValue({ processed: true } as never);
      const job = { name: 'process-file', data: { documentId: 'doc-1' } };
      const result = await processor(job);
      expect(handleProcessFileJob).toHaveBeenCalled();
      expect(result).toEqual({ processed: true });
    });

    it('routes delete-file jobs to handleDeleteFileJob', async () => {
      vi.mocked(handleDeleteFileJob).mockResolvedValue({ deleted: true } as never);
      const job = { name: 'delete-file', data: { documentId: 'doc-1' } };
      const result = await processor(job);
      expect(handleDeleteFileJob).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('throws for unknown job types', async () => {
      const job = { name: 'unknown-job', data: {} };
      await expect(processor(job)).rejects.toThrow('Unknown job: unknown-job');
    });
  });

  describe('event listeners', () => {
    it('error listener logs without throwing', () => {
      createSyncWorker(deps);
      const errorHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(() => errorHandler(new Error('connection lost'))).not.toThrow();
    });

    it('completed listener logs without throwing', () => {
      createSyncWorker(deps);
      const completedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'completed')?.[1];
      expect(() => completedHandler({ name: 'scan', id: 'j-1' })).not.toThrow();
    });
  });
});
