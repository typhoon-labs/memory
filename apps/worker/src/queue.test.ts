import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateQueue } = vi.hoisted(() => ({
  mockCreateQueue: vi.fn(),
}));

const KNOWN_QUEUES = new Set(['sync', 'scoring', 'experiments']);

vi.mock('@typhoon/queue', () => ({
  createQueueRegistry: () => {
    const queues = new Map<string, unknown>();
    return {
      init(name: string, redisUrl: string) {
        const existing = queues.get(name);
        if (existing) return existing;
        if (!KNOWN_QUEUES.has(name)) throw new Error(`Unknown queue: ${name}`);
        const queue = mockCreateQueue({ name, url: redisUrl });
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
}));

describe('worker queue module', () => {
  let mod: typeof import('./queue');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mod = await import('./queue');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initSyncQueue creates queue via createSyncQueue', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    const result = mod.initSyncQueue('redis://localhost:6379');

    expect(mockCreateQueue).toHaveBeenCalledWith({ name: 'sync', url: 'redis://localhost:6379' });
    expect(result).toBe(fakeQueue);
  });

  it('initSyncQueue is idempotent — second call returns same queue', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    const first = mod.initSyncQueue('redis://localhost:6379');
    const second = mod.initSyncQueue('redis://localhost:6379');

    expect(first).toBe(second);
    expect(mockCreateQueue).toHaveBeenCalledTimes(1);
  });

  it('getSyncQueue throws when not initialized', () => {
    expect(() => mod.getSyncQueue()).toThrow('Queue "sync" not initialized');
  });

  it('getSyncQueue returns queue after init', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    mod.initSyncQueue('redis://localhost:6379');
    const result = mod.getSyncQueue();

    expect(result).toBe(fakeQueue);
  });

  it('shutdownQueues calls queue.close()', async () => {
    const fakeQueue = { name: 'sync', close: vi.fn().mockResolvedValue(undefined) };
    mockCreateQueue.mockReturnValue(fakeQueue);

    mod.initSyncQueue('redis://localhost:6379');
    await mod.shutdownQueues();

    expect(fakeQueue.close).toHaveBeenCalledTimes(1);
  });

  it('shutdownQueues is safe when no queue exists', async () => {
    await expect(mod.shutdownQueues()).resolves.toBeUndefined();
  });

  it('initScoringQueue creates scoring queue', () => {
    const fakeQueue = { name: 'scoring', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    const result = mod.initScoringQueue('redis://localhost:6379');
    expect(result).toBe(fakeQueue);
  });

  it('getScoringQueue returns scoring queue after init', () => {
    const fakeQueue = { name: 'scoring', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    mod.initScoringQueue('redis://localhost:6379');
    expect(mod.getScoringQueue()).toBe(fakeQueue);
  });

  it('initExperimentQueue creates experiments queue', () => {
    const fakeQueue = { name: 'experiments', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    const result = mod.initExperimentQueue('redis://localhost:6379');
    expect(result).toBe(fakeQueue);
  });

  it('getExperimentQueue returns experiments queue after init', () => {
    const fakeQueue = { name: 'experiments', close: vi.fn() };
    mockCreateQueue.mockReturnValue(fakeQueue);

    mod.initExperimentQueue('redis://localhost:6379');
    expect(mod.getExperimentQueue()).toBe(fakeQueue);
  });
});
