import type { DefaultJobOptions, Queue } from 'bullmq';

import type { RedisProvider } from './redis-provider';

/** Default job options per queue. Adding a new queue is a single entry here. */
const QUEUE_DEFAULTS: Record<string, DefaultJobOptions | undefined> = {
  sync: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 60 * 60 * 4 }, // 4 hours — failures are archived to PG
  },
  reports: undefined,
  scoring: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { age: 86400, count: 10000 }, // 24h — aggregate retries may re-read children values
    removeOnFail: { age: 60 * 60 * 24 * 3 }, // 3 days
  },
  reviews: {
    attempts: 5, // extra retries for persistence-critical aggregate jobs
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: { age: 60 * 60 * 24 * 3 }, // 3 days
  },
  experiments: {
    attempts: 1, // experiments are expensive — no auto-retry
    removeOnComplete: { age: 86400, count: 100 }, // 24h
    removeOnFail: { age: 60 * 60 * 24 * 7 }, // 7 days
  },
  maintenance: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 100 }, // 24h
    removeOnFail: { age: 60 * 60 * 24 * 3 }, // 3 days
  },
};

export interface QueueRegistry {
  /** Initialize a queue by name. Idempotent — returns existing on repeated calls. */
  init(name: string, redis: RedisProvider): Queue;
  /** Get an initialized queue by name. Throws if not yet initialized. */
  get(name: string): Queue;
  /** Return all initialized queues. */
  getAll(): ReadonlyMap<string, Queue>;
  /** Close all initialized queues. */
  shutdown(): Promise<void>;
}

/**
 * Create an isolated queue registry.
 * Each app (API, worker, scheduler) creates its own registry instance.
 * Optionally accepts additional queue default-job-options beyond the built-in ones.
 */
export function createQueueRegistry(extraDefaults?: Record<string, DefaultJobOptions | undefined>): QueueRegistry {
  const queues = new Map<string, Queue>();
  const defaults = { ...QUEUE_DEFAULTS, ...extraDefaults };

  return {
    init(name: string, redis: RedisProvider): Queue {
      const existing = queues.get(name);
      if (existing) return existing;

      if (!(name in defaults)) throw new Error(`Unknown queue: ${name}`);

      const queue = redis.createQueue(name, defaults[name]);
      queues.set(name, queue);
      return queue;
    },

    get(name: string): Queue {
      const queue = queues.get(name);
      if (!queue) throw new Error(`Queue "${name}" not initialized — call init() first`);
      return queue;
    },

    getAll(): ReadonlyMap<string, Queue> {
      return queues;
    },

    async shutdown(): Promise<void> {
      await Promise.all([...queues.values()].map((q) => q.close()));
    },
  };
}
