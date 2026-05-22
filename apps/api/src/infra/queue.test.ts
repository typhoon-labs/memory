import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQueueEventsInstances } = vi.hoisted(() => {
  const mockQueueEventsInstances: Array<{
    name: string;
    events: Record<string, Array<(...args: unknown[]) => void>>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  return { mockQueueEventsInstances };
});

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

vi.mock('@typhoon/queue', () => ({
  createQueueRegistry: () => {
    const queues = new Map<string, unknown>();
    return {
      init(name: string, redis: { createQueue: (n: string) => unknown }) {
        const existing = queues.get(name);
        if (existing) return existing;
        if (name !== 'sync') throw new Error(`Unknown queue: ${name}`);
        const queue = redis.createQueue(name);
        queues.set(name, queue);
        return queue;
      },
      get(name: string) {
        const queue = queues.get(name);
        if (!queue) throw new Error(`Queue "${name}" not initialized — call init() first`);
        return queue;
      },
      getAll: () => queues,
      shutdown: async () => {
        await Promise.all([...queues.values()].map((q) => (q as { close: () => Promise<void> }).close()));
      },
    };
  },
  RedisProvider: class MockRedisProvider {
    createQueue(name: string) {
      return { name, close: vi.fn().mockResolvedValue(undefined) };
    }
    createQueueEvents(name: string) {
      return createMockQueueEvents(name);
    }
  },
}));

import { RedisProvider } from '@typhoon/queue';

describe('queue module', () => {
  let mod: typeof import('./queue');

  const redis = new RedisProvider();

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQueueEventsInstances.length = 0;
    vi.resetModules();
    mod = await import('./queue');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initQueue("sync") creates a sync queue', () => {
    const result = mod.initQueue('sync', redis);

    expect(result).toBeDefined();
    expect(result.name).toBe('sync');
  });

  it('initQueue with unknown name throws "Unknown queue: xyz"', () => {
    expect(() => mod.initQueue('xyz', redis)).toThrow('Unknown queue: xyz');
  });

  it('initQueue is idempotent — second call returns same queue', () => {
    const first = mod.initQueue('sync', redis);
    const second = mod.initQueue('sync', redis);

    expect(first).toBe(second);
  });

  it('getQueue throws when not initialized', () => {
    expect(() => mod.getQueue('sync')).toThrow('Queue "sync" not initialized');
  });

  it('getQueue returns queue after init', () => {
    const queue = mod.initQueue('sync', redis);
    const result = mod.getQueue('sync');

    expect(result).toBe(queue);
  });

  it('getAllQueues returns the internal Map', () => {
    mod.initQueue('sync', redis);

    const allQueues = mod.getAllQueues();
    expect(allQueues.size).toBe(1);
    expect(allQueues.has('sync')).toBe(true);
  });

  it('shutdownQueues closes all queues and events', async () => {
    const queue = mod.initQueue('sync', redis);

    await mod.shutdownQueues();

    expect(queue.close).toHaveBeenCalledTimes(1);
    for (const evtInstance of mockQueueEventsInstances) {
      expect(evtInstance.close).toHaveBeenCalledTimes(1);
    }
  });

  it('QueueEvents listeners re-emit on queueEventBus', () => {
    const emitted: unknown[] = [];
    mod.queueEventBus.on('event', (data: unknown) => emitted.push(data));

    mod.initQueue('sync', redis);

    // The QueueEvents mock should have been created
    expect(mockQueueEventsInstances).toHaveLength(1);
    const evtInstance = mockQueueEventsInstances[0];

    // Simulate a "completed" event from BullMQ
    const completedHandlers = evtInstance.events.completed;
    expect(completedHandlers).toBeDefined();
    completedHandlers[0]({ jobId: 'j-1' });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ queue: 'sync', type: 'completed', jobId: 'j-1' });

    mod.queueEventBus.removeAllListeners();
  });

  it('initSyncQueue / getSyncQueue are aliases for initQueue("sync") / getQueue("sync")', () => {
    const result = mod.initSyncQueue(redis);
    expect(result).toBeDefined();
    expect(result.name).toBe('sync');

    const got = mod.getSyncQueue();
    expect(got).toBe(result);
  });
});
