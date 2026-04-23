import { describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn(() => ({ values: vi.fn() }));
vi.mock('@typhoon/db', () => ({
  failedJobs: 'failed_jobs',
}));
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

vi.mock('bullmq', () => ({
  QueueEvents: class MockQueueEvents {
    events: Record<string, Array<(...args: unknown[]) => void>> = {};
    constructor(_name: string, _opts: unknown) {
      mockQueueEventsInstances.push(this as never);
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(handler);
    }
  },
}));

import { initFailedJobArchiver } from './failed-job-archiver';

function mockQueue(jobData: Record<string, unknown> | null = null) {
  return {
    name: 'sync',
    getJob: vi.fn(async () =>
      jobData ? { name: 'process-file', data: jobData, stacktrace: ['Error: fail'], attemptsMade: 3 } : null,
    ),
  };
}

describe('initFailedJobArchiver', () => {
  it('creates a QueueEvents listener for the failed event', () => {
    const queue = mockQueue();
    const db = { insert: mockInsert } as never;
    initFailedJobArchiver(queue as never, 'redis://localhost:6379', db);

    expect(mockQueueEventsInstances).toHaveLength(1);
    expect(mockQueueEventsInstances[0].events.failed).toBeDefined();
  });

  it('inserts into failedJobs table on failed event', async () => {
    const queue = mockQueue({ syncTargetId: 'st-1', documentId: 'doc-1' });
    const values = vi.fn();
    const db = { insert: vi.fn(() => ({ values })) } as never;

    initFailedJobArchiver(queue as never, 'redis://localhost:6379', db);

    const handler = mockQueueEventsInstances[mockQueueEventsInstances.length - 1].events.failed[0];
    await handler({ jobId: 'job-1', failedReason: 'Bedrock timeout' });

    expect(queue.getJob).toHaveBeenCalledWith('job-1');
    expect(values).toHaveBeenCalledWith(
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
    const db = {
      insert: vi.fn(() => {
        throw new Error('DB down');
      }),
    } as never;

    initFailedJobArchiver(queue as never, 'redis://localhost:6379', db);

    const handler = mockQueueEventsInstances[mockQueueEventsInstances.length - 1].events.failed[0];
    // Should not throw
    await handler({ jobId: 'job-1', failedReason: 'some error' });
  });
});
