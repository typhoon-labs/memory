import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries })),
}));

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return { queryKeys: actual.queryKeys };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((fn: () => () => void) => {
      // Immediately invoke the effect to capture setup/teardown
      const cleanup = fn();
      // Store cleanup for later use
      (useEffectCleanup as { current: (() => void) | null }).current = cleanup;
    }),
  };
});

import { queryKeys } from '@typhoon/api-client';

// Track the EventSource instance created inside the hook
const useEffectCleanup: { current: (() => void) | null } = { current: null };

class MockEventSource {
  static last: MockEventSource;

  url: string;
  withCredentials: boolean;
  listeners: Map<string, ((e: unknown) => void)[]> = new Map();
  closed = false;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.last = this;
  }

  addEventListener(type: string, listener: (e: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    const listeners = this.listeners.get(type) ?? [];
    for (const fn of listeners) fn(data);
  }
}

// Inject MockEventSource as global
const originalEventSource = globalThis.EventSource;
beforeEach(() => {
  (globalThis as Record<string, unknown>).EventSource = MockEventSource;
});
afterEach(() => {
  (globalThis as Record<string, unknown>).EventSource = originalEventSource;
  vi.clearAllMocks();
  useEffectCleanup.current = null;
});

// Must import after mocks are set up
const { useQueueEvents } = await import('./use-queue-events');

describe('useQueueEvents', () => {
  it('creates an EventSource to /api/v1/queues/events', () => {
    useQueueEvents();
    expect(MockEventSource.last.url).toBe('/api/v1/queues/events');
    expect(MockEventSource.last.withCredentials).toBe(true);
  });

  it('invalidates queues and documents on "open" event', () => {
    useQueueEvents();
    MockEventSource.last.emit('open', {});

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.all,
      predicate: expect.any(Function),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.syncTargets.all });
  });

  it('invalidates queue detail on queue-event after debounce', () => {
    vi.useFakeTimers();
    useQueueEvents();
    MockEventSource.last.emit('queue-event', { data: JSON.stringify({ queue: 'eval' }) });

    // Before debounce fires, nothing should happen yet (beyond the 'open' handler)
    invalidateQueries.mockClear();
    vi.advanceTimersByTime(200);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.queues.detail('eval'),
    });
    vi.useRealTimers();
  });

  it('invalidates documents and syncTargets for "sync" queue events', () => {
    vi.useFakeTimers();
    useQueueEvents();
    invalidateQueries.mockClear();

    MockEventSource.last.emit('queue-event', { data: JSON.stringify({ queue: 'sync' }) });
    vi.advanceTimersByTime(200);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.all,
      predicate: expect.any(Function),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.syncTargets.all });
    vi.useRealTimers();
  });

  it('ignores malformed queue-event payloads', () => {
    vi.useFakeTimers();
    useQueueEvents();
    invalidateQueries.mockClear();

    // Should not throw
    MockEventSource.last.emit('queue-event', { data: 'not-json' });
    vi.advanceTimersByTime(200);

    // Only open-event invalidations should exist -- not additional from the malformed event
    expect(invalidateQueries).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('closes the EventSource on cleanup', () => {
    useQueueEvents();
    expect(MockEventSource.last.closed).toBe(false);
    useEffectCleanup.current?.();
    expect(MockEventSource.last.closed).toBe(true);
  });
});
