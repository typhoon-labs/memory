import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    name: string;
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string, _opts: unknown) {
      this.name = name;
    }
  },
}));

import { RedisProvider } from './redis-provider';
import { createQueueRegistry } from './registry';

const redis = new RedisProvider({ REDIS_URL: 'redis://localhost:6379' });

describe('createQueueRegistry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('init creates a queue and returns it', () => {
    const registry = createQueueRegistry();
    const queue = registry.init('sync', redis);

    expect(queue).toBeDefined();
    expect(queue.name).toBe('sync');
  });

  it('init is idempotent — returns same queue on repeated calls', () => {
    const registry = createQueueRegistry();
    const first = registry.init('sync', redis);
    const second = registry.init('sync', redis);

    expect(first).toBe(second);
  });

  it('init throws for unknown queue name', () => {
    const registry = createQueueRegistry();
    expect(() => registry.init('unknown', redis)).toThrow('Unknown queue: unknown');
  });

  it('get returns queue after init', () => {
    const registry = createQueueRegistry();
    const queue = registry.init('scoring', redis);
    expect(registry.get('scoring')).toBe(queue);
  });

  it('get throws when not initialized', () => {
    const registry = createQueueRegistry();
    expect(() => registry.get('sync')).toThrow('Queue "sync" not initialized');
  });

  it('getAll returns all initialized queues', () => {
    const registry = createQueueRegistry();
    registry.init('sync', redis);
    registry.init('scoring', redis);

    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.has('sync')).toBe(true);
    expect(all.has('scoring')).toBe(true);
  });

  it('shutdown closes all queues', async () => {
    const registry = createQueueRegistry();
    const sync = registry.init('sync', redis);
    const scoring = registry.init('scoring', redis);

    await registry.shutdown();

    expect(sync.close).toHaveBeenCalledTimes(1);
    expect(scoring.close).toHaveBeenCalledTimes(1);
  });

  it('supports custom queue defaults via extraDefaults', () => {
    const registry = createQueueRegistry({ custom: { attempts: 5 } });
    const queue = registry.init('custom', redis);
    expect(queue).toBeDefined();
    expect(queue.name).toBe('custom');
  });
});
