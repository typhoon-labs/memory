import { act, renderHook } from '@testing-library/react';
import type { ChatStatus, UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamStallDetection } from './use-stream-stall-detection';

function makeMessage(id: string, role: 'user' | 'assistant' = 'assistant', partsCount = 1): UIMessage {
  return {
    id,
    role,
    parts: Array.from({ length: partsCount }, (_, i) => ({ type: 'text' as const, text: `part-${i}` })),
  };
}

describe('useStreamStallDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when status is ready', () => {
    const stop = vi.fn();
    const { result } = renderHook(() =>
      useStreamStallDetection({
        messages: [makeMessage('1')],
        status: 'ready' as ChatStatus,
        stop,
      }),
    );
    expect(result.current).toBeNull();
    expect(stop).not.toHaveBeenCalled();
  });

  it('returns null while messages keep updating during streaming', () => {
    const stop = vi.fn();
    const messages = [makeMessage('1')];
    const { result, rerender } = renderHook(
      ({ msgs, status }) => useStreamStallDetection({ messages: msgs, status, stop }),
      { initialProps: { msgs: messages, status: 'streaming' as ChatStatus } },
    );

    // Advance 10s — under the 15s threshold
    act(() => vi.advanceTimersByTime(10_000));

    // Simulate a message update (new parts)
    rerender({
      msgs: [makeMessage('1', 'assistant', 3)],
      status: 'streaming' as ChatStatus,
    });

    // Advance another 10s — still under threshold since activity was reset
    act(() => vi.advanceTimersByTime(10_000));

    expect(result.current).toBeNull();
    expect(stop).not.toHaveBeenCalled();
  });

  it('detects a stall and calls stop after 15s of no activity', () => {
    const stop = vi.fn();
    const messages = [makeMessage('1')];
    const { result } = renderHook(() =>
      useStreamStallDetection({
        messages,
        status: 'streaming' as ChatStatus,
        stop,
      }),
    );

    expect(result.current).toBeNull();

    // Advance past the stall timeout (15s) + check interval (5s)
    act(() => vi.advanceTimersByTime(20_000));

    expect(stop).toHaveBeenCalledOnce();
    expect(result.current).toBeInstanceOf(Error);
    expect(result.current?.message).toContain('Connection lost');
  });

  it('detects a stall in submitted status', () => {
    const stop = vi.fn();
    const { result } = renderHook(() =>
      useStreamStallDetection({
        messages: [],
        status: 'submitted' as ChatStatus,
        stop,
      }),
    );

    act(() => vi.advanceTimersByTime(20_000));

    expect(stop).toHaveBeenCalledOnce();
    expect(result.current).toBeInstanceOf(Error);
  });

  it('clears stall error when a new request starts', () => {
    const stop = vi.fn();
    const { result, rerender } = renderHook(
      ({ status }) =>
        useStreamStallDetection({
          messages: [makeMessage('1')],
          status,
          stop,
        }),
      { initialProps: { status: 'streaming' as ChatStatus } },
    );

    // Trigger a stall
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current).toBeInstanceOf(Error);

    // New request starts — error should clear
    rerender({ status: 'submitted' as ChatStatus });
    expect(result.current).toBeNull();
  });

  it('does not trigger when status transitions to ready before timeout', () => {
    const stop = vi.fn();
    const { result, rerender } = renderHook(
      ({ status }) =>
        useStreamStallDetection({
          messages: [makeMessage('1')],
          status,
          stop,
        }),
      { initialProps: { status: 'streaming' as ChatStatus } },
    );

    // Advance 10s — not yet stalled
    act(() => vi.advanceTimersByTime(10_000));

    // Stream finishes normally
    rerender({ status: 'ready' as ChatStatus });

    // Advance well past what would have been the stall timeout
    act(() => vi.advanceTimersByTime(30_000));

    expect(stop).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
