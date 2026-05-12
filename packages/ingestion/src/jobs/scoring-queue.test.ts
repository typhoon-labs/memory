import { describe, expect, it, vi } from 'vitest';

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    opts: unknown;
    constructor(name: string, opts: unknown) {
      this.name = name;
      this.opts = opts;
    }
  }
  return { Queue: MockQueue };
});

import { createScoringQueue } from './scoring-queue';

function getOpts(queue: unknown) {
  return (queue as { opts: { defaultJobOptions: Record<string, unknown> } }).opts;
}

describe('createScoringQueue', () => {
  it('creates a queue named "scoring"', () => {
    const queue = createScoringQueue({ url: 'redis://localhost:6379' });
    expect(queue.name).toBe('scoring');
  });

  it('configures 3 retry attempts with exponential backoff', () => {
    const queue = createScoringQueue({ url: 'redis://localhost:6379' });
    expect(getOpts(queue).defaultJobOptions.attempts).toBe(3);
    expect(getOpts(queue).defaultJobOptions.backoff).toEqual({ type: 'exponential', delay: 10_000 });
  });

  it('removes completed jobs after 24 hours or 10000 count', () => {
    const queue = createScoringQueue({ url: 'redis://localhost:6379' });
    expect(getOpts(queue).defaultJobOptions.removeOnComplete).toEqual({ age: 86400, count: 10000 });
  });

  it('keeps failed jobs for 3 days', () => {
    const queue = createScoringQueue({ url: 'redis://localhost:6379' });
    expect(getOpts(queue).defaultJobOptions.removeOnFail).toEqual({ age: 60 * 60 * 24 * 3 });
  });
});
