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

function makeToolMessage(
  id: string,
  toolState: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'output-denied',
): UIMessage {
  // Build the part to match the AI SDK v6 ToolInvocationUIPart union.
  // Tool parts have type `tool-${toolName}`. We cast to UIMessage['parts'][number]
  // to avoid duplicating every discriminated-union branch.
  const part = {
    type: 'tool-knowledgeSearch',
    toolCallId: 'call-1',
    toolName: 'knowledgeSearch',
    state: toolState,
    input: { query: 'test' },
    ...(toolState === 'output-available' ? { output: 'results' } : {}),
    ...(toolState === 'output-error' ? { errorText: 'failed' } : {}),
  } as UIMessage['parts'][number];

  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text' as const, text: 'Searching...' }, part],
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
    expect(result.current.stallError).toBeNull();
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

    expect(result.current.stallError).toBeNull();
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

    expect(result.current.stallError).toBeNull();

    // Advance past the stall timeout (15s) + check interval (5s)
    act(() => vi.advanceTimersByTime(20_000));

    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.stallError).toBeInstanceOf(Error);
    expect(result.current.stallError?.message).toContain('Connection lost');
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
    expect(result.current.stallError).toBeInstanceOf(Error);
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
    expect(result.current.stallError).toBeInstanceOf(Error);

    // New request starts — error should clear
    rerender({ status: 'submitted' as ChatStatus });
    expect(result.current.stallError).toBeNull();
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
    expect(result.current.stallError).toBeNull();
  });

  // --- Tool-aware timeout tests ---

  it('uses 60s timeout when a tool call is pending', () => {
    const stop = vi.fn();
    const messages = [makeToolMessage('1', 'input-available')];
    const { result } = renderHook(() =>
      useStreamStallDetection({
        messages,
        status: 'streaming' as ChatStatus,
        stop,
      }),
    );

    // Advance 20s — would trigger with 15s timeout but not 60s
    act(() => vi.advanceTimersByTime(20_000));
    expect(stop).not.toHaveBeenCalled();
    expect(result.current.stallError).toBeNull();

    // Advance to 50s — still under 60s
    act(() => vi.advanceTimersByTime(30_000));
    expect(stop).not.toHaveBeenCalled();

    // Advance past 60s total
    act(() => vi.advanceTimersByTime(15_000));
    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.stallError).toBeInstanceOf(Error);
  });

  it('reverts to 15s timeout after tool completes', () => {
    const stop = vi.fn();
    const { result, rerender } = renderHook(
      ({ msgs }) =>
        useStreamStallDetection({
          messages: msgs,
          status: 'streaming' as ChatStatus,
          stop,
        }),
      { initialProps: { msgs: [makeToolMessage('1', 'input-available')] } },
    );

    // Advance 10s with pending tool — no stall
    act(() => vi.advanceTimersByTime(10_000));
    expect(stop).not.toHaveBeenCalled();

    // Tool completes — activity resets (parts length changes)
    rerender({ msgs: [makeToolMessage('1', 'output-available')] });

    // Now 15s timeout applies; advance 20s from the activity reset
    act(() => vi.advanceTimersByTime(20_000));
    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.stallError).toBeInstanceOf(Error);
  });

  // --- clearStallError ---

  it('clearStallError clears the stall error', () => {
    const stop = vi.fn();
    const { result } = renderHook(() =>
      useStreamStallDetection({
        messages: [makeMessage('1')],
        status: 'streaming' as ChatStatus,
        stop,
      }),
    );

    // Trigger stall
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.stallError).toBeInstanceOf(Error);

    // Clear explicitly (simulating recovery success)
    act(() => result.current.clearStallError());
    expect(result.current.stallError).toBeNull();
  });

  it('does not auto-clear stall error on message changes', () => {
    const stop = vi.fn();
    const { result, rerender } = renderHook(
      ({ msgs }) =>
        useStreamStallDetection({
          messages: msgs,
          status: 'streaming' as ChatStatus,
          stop,
        }),
      { initialProps: { msgs: [makeMessage('1')] } },
    );

    // Trigger stall
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.stallError).toBeInstanceOf(Error);

    // Message changes (e.g. from stop() finalizing) should NOT clear the error
    rerender({ msgs: [makeMessage('1'), makeMessage('2')] });
    expect(result.current.stallError).toBeInstanceOf(Error);
  });
});
