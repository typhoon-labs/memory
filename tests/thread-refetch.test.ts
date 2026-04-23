import { describe, expect, it } from 'vitest';

/**
 * Tests for the refetchInterval logic used by useThreads and useThread.
 * Extracted as pure functions to verify the self-disabling polling behavior
 * that recovers thread titles and messages after page refresh.
 */

function threadsRefetchInterval(threads: Array<{ title: string; createdAt: string }> | undefined): number | false {
  if (!threads) return false;
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  const hasRecentUntitled = threads.some((t) => !t.title && new Date(t.createdAt).getTime() > twoMinutesAgo);
  return hasRecentUntitled ? 5_000 : false;
}

function threadRefetchInterval(data: { createdAt: string; messages: unknown[] } | undefined): number | false {
  if (!data) return false;
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  const isRecent = new Date(data.createdAt).getTime() > twoMinutesAgo;
  const hasNoMessages = !data.messages || data.messages.length === 0;
  return isRecent && hasNoMessages ? 5_000 : false;
}

describe('threadsRefetchInterval', () => {
  it('returns false when threads is undefined', () => {
    expect(threadsRefetchInterval(undefined)).toBe(false);
  });

  it('returns false when all threads have titles', () => {
    const threads = [
      { title: 'Thread 1', createdAt: new Date().toISOString() },
      { title: 'Thread 2', createdAt: new Date().toISOString() },
    ];
    expect(threadsRefetchInterval(threads)).toBe(false);
  });

  it('returns 5000 when a recent thread has no title', () => {
    const threads = [
      { title: 'Thread 1', createdAt: new Date().toISOString() },
      { title: '', createdAt: new Date().toISOString() },
    ];
    expect(threadsRefetchInterval(threads)).toBe(5_000);
  });

  it('returns false when untitled thread is older than 2 minutes', () => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const threads = [{ title: '', createdAt: threeMinutesAgo }];
    expect(threadsRefetchInterval(threads)).toBe(false);
  });

  it('returns 5000 when untitled thread is within 2-minute window', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const threads = [{ title: '', createdAt: oneMinuteAgo }];
    expect(threadsRefetchInterval(threads)).toBe(5_000);
  });

  it('returns false for empty thread list', () => {
    expect(threadsRefetchInterval([])).toBe(false);
  });

  it('ignores old untitled threads alongside recent titled ones', () => {
    const threads = [
      { title: 'Recent', createdAt: new Date().toISOString() },
      { title: '', createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
    ];
    expect(threadsRefetchInterval(threads)).toBe(false);
  });
});

describe('threadRefetchInterval', () => {
  it('returns false when data is undefined', () => {
    expect(threadRefetchInterval(undefined)).toBe(false);
  });

  it('returns false when thread has messages', () => {
    const data = {
      createdAt: new Date().toISOString(),
      messages: [{ id: '1', role: 'user', parts: [], createdAt: new Date().toISOString() }],
    };
    expect(threadRefetchInterval(data)).toBe(false);
  });

  it('returns 5000 when recent thread has no messages', () => {
    const data = {
      createdAt: new Date().toISOString(),
      messages: [],
    };
    expect(threadRefetchInterval(data)).toBe(5_000);
  });

  it('returns false when thread with no messages is older than 2 minutes', () => {
    const data = {
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      messages: [],
    };
    expect(threadRefetchInterval(data)).toBe(false);
  });

  it('returns 5000 when thread within 2-minute window has no messages', () => {
    const data = {
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
      messages: [],
    };
    expect(threadRefetchInterval(data)).toBe(5_000);
  });

  it('returns false when old thread has no messages', () => {
    const data = {
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      messages: [],
    };
    expect(threadRefetchInterval(data)).toBe(false);
  });
});
