import type { ConnectionOptions, Queue } from 'bullmq';
import { createExperimentQueue } from './queues/experiments';
import { createReviewsQueue } from './queues/reviews';
import { createScoringQueue } from './queues/scoring';

import { createReportsQueue, createSyncQueue } from './queues/sync';

type QueueFactory = (connection: ConnectionOptions) => Queue;

const BUILTIN_FACTORIES: Record<string, QueueFactory> = {
  sync: createSyncQueue,
  reports: createReportsQueue,
  scoring: createScoringQueue,
  reviews: createReviewsQueue,
  experiments: createExperimentQueue,
};

export interface QueueRegistry {
  /** Initialize a queue by name. Idempotent — returns existing on repeated calls. */
  init(name: string, redisUrl: string): Queue;
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
 * Optionally accepts additional queue factories beyond the built-in ones.
 */
export function createQueueRegistry(extraFactories?: Record<string, QueueFactory>): QueueRegistry {
  const queues = new Map<string, Queue>();
  const factories = { ...BUILTIN_FACTORIES, ...extraFactories };

  return {
    init(name: string, redisUrl: string): Queue {
      const existing = queues.get(name);
      if (existing) return existing;

      const factory = factories[name];
      if (!factory) throw new Error(`Unknown queue: ${name}`);

      const queue = factory({ url: redisUrl });
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
