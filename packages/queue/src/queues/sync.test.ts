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

import { createReportsQueue, createSyncQueue } from './sync';

describe('createSyncQueue', () => {
  const connection = { host: 'localhost', port: 6379 };

  it('creates a queue named "sync"', () => {
    createSyncQueue(connection);
    expect(ctorCalls[0].name).toBe('sync');
  });

  it('passes connection options through', () => {
    createSyncQueue(connection);
    const opts = ctorCalls[0].opts as Record<string, unknown>;
    expect(opts.connection).toBe(connection);
  });

  it('sets attempts to 3', () => {
    createSyncQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { attempts: number } };
    expect(opts.defaultJobOptions.attempts).toBe(3);
  });

  it('sets exponential backoff with 5s delay', () => {
    createSyncQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { backoff: { type: string; delay: number } } };
    expect(opts.defaultJobOptions.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });

  it('sets removeOnComplete age=3600 count=1000', () => {
    createSyncQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { removeOnComplete: { age: number; count: number } } };
    expect(opts.defaultJobOptions.removeOnComplete).toEqual({ age: 3600, count: 1000 });
  });

  it('sets removeOnFail age to 14400 (4 hours)', () => {
    createSyncQueue(connection);
    const opts = ctorCalls[0].opts as { defaultJobOptions: { removeOnFail: { age: number } } };
    expect(opts.defaultJobOptions.removeOnFail.age).toBe(60 * 60 * 4);
  });
});

describe('createReportsQueue', () => {
  const connection = { host: 'localhost', port: 6379 };

  it('creates a queue named "reports"', () => {
    ctorCalls.length = 0;
    createReportsQueue(connection);
    expect(ctorCalls[0].name).toBe('reports');
  });

  it('passes connection options through', () => {
    ctorCalls.length = 0;
    createReportsQueue(connection);
    const opts = ctorCalls[0].opts as Record<string, unknown>;
    expect(opts.connection).toBe(connection);
  });
});
