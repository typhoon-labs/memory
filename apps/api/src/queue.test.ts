import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateSyncQueue, mockQueueEventsInstances } = vi.hoisted(() => {
  const mockCreateSyncQueue = vi.fn();
  const mockQueueEventsInstances: Array<{
    name: string;
    events: Record<string, Array<(...args: unknown[]) => void>>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  return { mockCreateSyncQueue, mockQueueEventsInstances };
});

vi.mock('@typhoon/ingestion', () => ({
  createSyncQueue: mockCreateSyncQueue,
}));

vi.mock('bullmq', () => ({
  QueueEvents: class MockQueueEvents {
    name: string;
    events: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor(name: string, _opts: unknown) {
      this.name = name;
      mockQueueEventsInstances.push(this as never);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(handler);
    }

    close = vi.fn().mockResolvedValue(undefined);
  },
}));

describe('queue module', () => {
  let mod: typeof import('./queue');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQueueEventsInstances.length = 0;
    vi.resetModules();
    mod = await import('./queue');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initQueue("sync") creates a sync queue via createSyncQueue', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    const result = mod.initQueue('sync', 'redis://localhost:6379');

    expect(mockCreateSyncQueue).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(result).toBe(fakeQueue);
  });

  it('initQueue with unknown name throws "Unknown queue: xyz"', () => {
    expect(() => mod.initQueue('xyz', 'redis://localhost:6379')).toThrow('Unknown queue: xyz');
  });

  it('initQueue is idempotent — second call returns same queue', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    const first = mod.initQueue('sync', 'redis://localhost:6379');
    const second = mod.initQueue('sync', 'redis://localhost:6379');

    expect(first).toBe(second);
    expect(mockCreateSyncQueue).toHaveBeenCalledTimes(1);
  });

  it('getQueue throws when not initialized', () => {
    expect(() => mod.getQueue('sync')).toThrow('Queue "sync" not initialized');
  });

  it('getQueue returns queue after init', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    mod.initQueue('sync', 'redis://localhost:6379');
    const result = mod.getQueue('sync');

    expect(result).toBe(fakeQueue);
  });

  it('getAllQueues returns the internal Map', () => {
    const fakeSync = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeSync);

    mod.initQueue('sync', 'redis://localhost:6379');

    const allQueues = mod.getAllQueues();
    expect(allQueues.size).toBe(1);
    expect(allQueues.get('sync')).toBe(fakeSync);
  });

  it('shutdownQueues closes all queues and events', async () => {
    const fakeSync = { name: 'sync', close: vi.fn().mockResolvedValue(undefined) };
    mockCreateSyncQueue.mockReturnValue(fakeSync);

    mod.initQueue('sync', 'redis://localhost:6379');

    await mod.shutdownQueues();

    expect(fakeSync.close).toHaveBeenCalledTimes(1);
    for (const evtInstance of mockQueueEventsInstances) {
      expect(evtInstance.close).toHaveBeenCalledTimes(1);
    }
  });

  it('QueueEvents listeners re-emit on queueEventBus', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    const emitted: unknown[] = [];
    mod.queueEventBus.on('event', (data: unknown) => emitted.push(data));

    mod.initQueue('sync', 'redis://localhost:6379');

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
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    const result = mod.initSyncQueue('redis://localhost:6379');
    expect(result).toBe(fakeQueue);
    expect(mockCreateSyncQueue).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });

    const got = mod.getSyncQueue();
    expect(got).toBe(fakeQueue);
  });
});
