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

import { createQueueRegistry } from './registry';

describe('createQueueRegistry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('init creates a queue and returns it', () => {
    const registry = createQueueRegistry();
    const queue = registry.init('sync', 'redis://localhost:6379');

    expect(queue).toBeDefined();
    expect(queue.name).toBe('sync');
  });

  it('init is idempotent — returns same queue on repeated calls', () => {
    const registry = createQueueRegistry();
    const first = registry.init('sync', 'redis://localhost:6379');
    const second = registry.init('sync', 'redis://localhost:6379');

    expect(first).toBe(second);
  });

  it('init throws for unknown queue name', () => {
    const registry = createQueueRegistry();
    expect(() => registry.init('unknown', 'redis://localhost:6379')).toThrow('Unknown queue: unknown');
  });

  it('get returns queue after init', () => {
    const registry = createQueueRegistry();
    const queue = registry.init('scoring', 'redis://localhost:6379');
    expect(registry.get('scoring')).toBe(queue);
  });

  it('get throws when not initialized', () => {
    const registry = createQueueRegistry();
    expect(() => registry.get('sync')).toThrow('Queue "sync" not initialized');
  });

  it('getAll returns all initialized queues', () => {
    const registry = createQueueRegistry();
    registry.init('sync', 'redis://localhost:6379');
    registry.init('scoring', 'redis://localhost:6379');

    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.has('sync')).toBe(true);
    expect(all.has('scoring')).toBe(true);
  });

  it('shutdown closes all queues', async () => {
    const registry = createQueueRegistry();
    const sync = registry.init('sync', 'redis://localhost:6379');
    const scoring = registry.init('scoring', 'redis://localhost:6379');

    await registry.shutdown();

    expect(sync.close).toHaveBeenCalledTimes(1);
    expect(scoring.close).toHaveBeenCalledTimes(1);
  });

  it('supports custom queue factories via extraFactories', () => {
    const customFactory = vi.fn().mockReturnValue({ name: 'custom', close: vi.fn() });
    const registry = createQueueRegistry({ custom: customFactory });

    const queue = registry.init('custom', 'redis://localhost:6379');

    expect(customFactory).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(queue.name).toBe('custom');
  });
});
