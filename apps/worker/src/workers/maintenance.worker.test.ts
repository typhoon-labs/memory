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
  PartitionRepo: class {
    constructor() {}
  },
}));

vi.mock('@typhoon/ingestion', () => ({
  managePartitions: vi.fn(),
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { managePartitions } from '@typhoon/ingestion';

import { createMaintenanceWorker } from './maintenance.worker';
import type { MaintenanceWorkerDeps } from './types';

describe('createMaintenanceWorker', () => {
  let deps: MaintenanceWorkerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      redis: {
        createWorker: (...args: unknown[]) => {
          mockWorkerConstructor(...args);
          return mockWorkerInstance;
        },
      } as unknown as MaintenanceWorkerDeps['redis'],
      db: {} as MaintenanceWorkerDeps['db'],
      maintenanceQueue: { add: vi.fn().mockResolvedValue({}) } as unknown as MaintenanceWorkerDeps['maintenanceQueue'],
    };
  });

  it('creates a BullMQ Worker for the maintenance queue with concurrency 1', () => {
    createMaintenanceWorker(deps);

    expect(mockWorkerConstructor).toHaveBeenCalledTimes(1);
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      'maintenance',
      expect.any(Function),
      expect.objectContaining({
        concurrency: 1,
      }),
    );
  });

  it('returns the worker instance', () => {
    const worker = createMaintenanceWorker(deps);
    expect(worker).toBe(mockWorkerInstance);
  });

  it('registers error and failed event listeners', () => {
    createMaintenanceWorker(deps);
    const onCalls = mockWorkerInstance.on.mock.calls.map((call) => call[0]);
    expect(onCalls).toContain('error');
    expect(onCalls).toContain('failed');
  });

  it('registers partition management repeatable job on the maintenance queue', () => {
    createMaintenanceWorker(deps);

    expect((deps.maintenanceQueue as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'partition-management',
      expect.objectContaining({ retentionDays: expect.any(Number) }),
      expect.objectContaining({
        repeat: { pattern: '0 2 * * *' },
        jobId: 'partition-mgmt',
      }),
    );
  });

  describe('job processor', () => {
    let processor: (job: Record<string, unknown>) => Promise<unknown>;

    beforeEach(() => {
      createMaintenanceWorker(deps);
      processor = mockWorkerConstructor.mock.calls[0][1];
    });

    it('handles partition-management job (calls managePartitions, returns result)', async () => {
      const mockResult = { created: 2, dropped: 1 };
      vi.mocked(managePartitions).mockResolvedValue(mockResult as never);

      const job = { name: 'partition-management', data: { retentionDays: 30 } };
      const result = await processor(job);

      expect(managePartitions).toHaveBeenCalledTimes(1);
      expect(managePartitions).toHaveBeenCalledWith(expect.any(Object), { retentionDays: 30 });
      expect(result).toBe(mockResult);
    });

    it('defaults retentionDays to 90 when not provided', async () => {
      const mockResult = { created: 0, dropped: 0 };
      vi.mocked(managePartitions).mockResolvedValue(mockResult as never);

      const job = { name: 'partition-management', data: {} };
      await processor(job);

      expect(managePartitions).toHaveBeenCalledWith(expect.any(Object), { retentionDays: 90 });
    });

    it('throws for unknown job types', async () => {
      const job = { name: 'unknown-job', data: {} };
      await expect(processor(job)).rejects.toThrow('Unknown maintenance job: unknown-job');
    });
  });

  describe('event listeners', () => {
    it('error listener logs without throwing', () => {
      createMaintenanceWorker(deps);
      const errorHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'error')?.[1];
      expect(() => errorHandler(new Error('test error'))).not.toThrow();
    });

    it('failed listener logs without throwing', () => {
      createMaintenanceWorker(deps);
      const failedHandler = mockWorkerInstance.on.mock.calls.find((call) => call[0] === 'failed')?.[1];
      expect(() => failedHandler({ id: 'j1', name: 'partition-management' }, new Error('fail'))).not.toThrow();
    });
  });
});
