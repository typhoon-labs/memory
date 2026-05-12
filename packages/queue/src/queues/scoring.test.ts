import { describe, expect, it, vi } from 'vitest';

const { ctorCalls } = vi.hoisted(() => {
  const ctorCalls: Array<{ name: string; opts: unknown }> = [];
  return { ctorCalls };
});

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor(name: string, opts: unknown) {
      ctorCalls.push({ name, opts });
    }
  },
}));

import { createScoringQueue } from './scoring';

describe('createScoringQueue', () => {
  const connection = { host: 'localhost', port: 6379 };

  it('creates a queue named "scoring"', () => {
    createScoringQueue(connection);
    expect(ctorCalls[0].name).toBe('scoring');
  });

  it('passes connection options through', () => {
    createScoringQueue(connection);
    const opts = ctorCalls[0].opts as Record<string, unknown>;
    expect(opts.connection).toBe(connection);
  });

  it('sets attempts to 3', () => {
    createScoringQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { attempts: number } };
    expect(opts.defaultJobOptions.attempts).toBe(3);
  });

  it('sets exponential backoff with 10s delay', () => {
    createScoringQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { backoff: { type: string; delay: number } } };
    expect(opts.defaultJobOptions.backoff).toEqual({ type: 'exponential', delay: 10_000 });
  });

  it('sets removeOnComplete age=86400 count=10000', () => {
    createScoringQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { removeOnComplete: { age: number; count: number } } };
    expect(opts.defaultJobOptions.removeOnComplete).toEqual({ age: 86400, count: 10000 });
  });

  it('sets removeOnFail age to 259200 (3 days)', () => {
    createScoringQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { removeOnFail: { age: number } } };
    expect(opts.defaultJobOptions.removeOnFail.age).toBe(60 * 60 * 24 * 3);
  });
});
