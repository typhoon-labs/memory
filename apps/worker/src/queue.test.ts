import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateSyncQueue } = vi.hoisted(() => ({
  mockCreateSyncQueue: vi.fn(),
}));

vi.mock('@typhoon/ingestion', () => ({
  createSyncQueue: mockCreateSyncQueue,
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
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    const result = mod.initSyncQueue('redis://localhost:6379');

    expect(mockCreateSyncQueue).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(result).toBe(fakeQueue);
  });

  it('initSyncQueue is idempotent — second call returns same queue', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    const first = mod.initSyncQueue('redis://localhost:6379');
    const second = mod.initSyncQueue('redis://localhost:6379');

    expect(first).toBe(second);
    expect(mockCreateSyncQueue).toHaveBeenCalledTimes(1);
  });

  it('getSyncQueue throws when not initialized', () => {
    expect(() => mod.getSyncQueue()).toThrow('Sync queue not initialized');
  });

  it('getSyncQueue returns queue after init', () => {
    const fakeQueue = { name: 'sync', close: vi.fn() };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    mod.initSyncQueue('redis://localhost:6379');
    const result = mod.getSyncQueue();

    expect(result).toBe(fakeQueue);
  });

  it('shutdownQueues calls queue.close()', async () => {
    const fakeQueue = { name: 'sync', close: vi.fn().mockResolvedValue(undefined) };
    mockCreateSyncQueue.mockReturnValue(fakeQueue);

    mod.initSyncQueue('redis://localhost:6379');
    await mod.shutdownQueues();

    expect(fakeQueue.close).toHaveBeenCalledTimes(1);
  });

  it('shutdownQueues is safe when no queue exists', async () => {
    await expect(mod.shutdownQueues()).resolves.toBeUndefined();
  });
});
