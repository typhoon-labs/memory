import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

const { mockQueueEventsInstances } = vi.hoisted(() => {
  const mockQueueEventsInstances: Array<{
    events: Record<string, Array<(...args: unknown[]) => void>>;
    on: ReturnType<typeof vi.fn>;
  }> = [];
  return { mockQueueEventsInstances };
});

import { initFailedJobArchiver } from './failed-job-archiver';

function createMockQueueEvents(name: string) {
  const instance = {
    name,
    events: {} as Record<string, Array<(...args: unknown[]) => void>>,
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!instance.events[event]) instance.events[event] = [];
      instance.events[event].push(handler);
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
  mockQueueEventsInstances.push(instance as never);
  return instance;
}

const mockRedis = {
  createQueueEvents: (name: string) => createMockQueueEvents(name),
};

function mockQueue(jobData: Record<string, unknown> | null = null) {
  return {
    name: 'sync',
    getJob: vi.fn(async () =>
      jobData ? { name: 'process-file', data: jobData, stacktrace: ['Error: fail'], attemptsMade: 3 } : null,
    ),
  };
}

function mockFailedJobRepo() {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('initFailedJobArchiver', () => {
  it('creates a QueueEvents listener for the failed event', () => {
    const queue = mockQueue();
    const repo = mockFailedJobRepo();
    initFailedJobArchiver(queue as never, mockRedis as never, repo as never);

    expect(mockQueueEventsInstances).toHaveLength(1);
    expect(mockQueueEventsInstances[0].events.failed).toBeDefined();
  });

  it('inserts into failedJobs table on failed event', async () => {
    const queue = mockQueue({ syncTargetId: 'st-1', documentId: 'doc-1' });
    const repo = mockFailedJobRepo();

    initFailedJobArchiver(queue as never, mockRedis as never, repo as never);

    const instance = mockQueueEventsInstances.at(-1);
    expect(instance).toBeDefined();
    const handler = instance?.events.failed[0];
    await handler?.({ jobId: 'job-1', failedReason: 'Bedrock timeout' });

    expect(queue.getJob).toHaveBeenCalledWith('job-1');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'sync',
        jobName: 'process-file',
        jobId: 'job-1',
        failedReason: 'Bedrock timeout',
        syncTargetId: 'st-1',
        documentId: 'doc-1',
      }),
    );
  });

  it('does not throw when archival fails', async () => {
    const queue = mockQueue();
    const repo = mockFailedJobRepo();
    repo.create.mockRejectedValueOnce(new Error('DB down'));

    initFailedJobArchiver(queue as never, mockRedis as never, repo as never);

    const instance2 = mockQueueEventsInstances.at(-1);
    expect(instance2).toBeDefined();
    const handler = instance2?.events.failed[0];
    await expect(handler?.({ jobId: 'job-1', failedReason: 'some error' })).resolves.not.toThrow();
  });
});
