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

import { createExperimentQueue } from './experiments';

describe('createExperimentQueue', () => {
  const connection = { host: 'localhost', port: 6379 };

  it('creates a queue named "experiments"', () => {
    createExperimentQueue(connection);
    expect(ctorCalls[0].name).toBe('experiments');
  });

  it('passes connection options through', () => {
    createExperimentQueue(connection);
    const opts = ctorCalls[0].opts as Record<string, unknown>;
    expect(opts.connection).toBe(connection);
  });

  it('sets attempts to 1 (no auto-retry)', () => {
    createExperimentQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { attempts: number } };
    expect(opts.defaultJobOptions.attempts).toBe(1);
  });

  it('sets removeOnComplete age to 86400 (24h)', () => {
    createExperimentQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { removeOnComplete: { age: number } } };
    expect(opts.defaultJobOptions.removeOnComplete.age).toBe(86400);
  });

  it('sets removeOnFail age to 604800 (7 days)', () => {
    createExperimentQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { removeOnFail: { age: number } } };
    expect(opts.defaultJobOptions.removeOnFail.age).toBe(60 * 60 * 24 * 7);
  });
});
