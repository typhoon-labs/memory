import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { apiFetch } from '@typhoon/ui';
import { createElement, type ReactNode } from 'react';

import { useFeedback } from './use-feedback';

const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useFeedback', () => {
  it('returns empty feedback state when threadId is undefined', () => {
    const { result } = renderHook(() => useFeedback(undefined), { wrapper: createWrapper() });
    expect(result.current.feedbackState.size).toBe(0);
    expect(typeof result.current.handleFeedback).toBe('function');
  });

  it('fetches feedback entries for a given thread', async () => {
    mockApiFetch.mockResolvedValue([
      { id: 'fb-1', messageId: 'msg-1', rating: 'positive' },
      { id: 'fb-2', messageId: 'msg-2', rating: 'negative', comment: 'Not helpful' },
    ]);

    const { result } = renderHook(() => useFeedback('thread-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.feedbackState.size).toBe(2));
    expect(result.current.feedbackState.get('msg-1')?.rating).toBe('positive');
    expect(result.current.feedbackState.get('msg-2')?.rating).toBe('negative');
    expect(result.current.feedbackState.get('msg-2')?.comment).toBe('Not helpful');
  });

  it('handleFeedback calls apiFetch with correct arguments', async () => {
    mockApiFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useFeedback('thread-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.feedbackState).toBeDefined());

    // Reset mock to track the mutation call
    mockApiFetch.mockResolvedValue({});

    act(() => {
      result.current.handleFeedback('msg-1', 'positive', 'Great answer');
    });

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 'msg-1', rating: 'positive', comment: 'Great answer' }),
      }),
    );
  });

  it('applies optimistic update on mutation', async () => {
    mockApiFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useFeedback('thread-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.feedbackState).toBeDefined());

    // Route mutation POST to a success response, but keep GET returning valid arrays
    mockApiFetch.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({});
      // Query re-fetches should still return a valid array
      return Promise.resolve([{ id: 'fb-opt', messageId: 'msg-1', rating: 'positive' }]);
    });

    act(() => {
      result.current.handleFeedback('msg-1', 'positive');
    });

    // Optimistic update should add the entry immediately
    await waitFor(() => expect(result.current.feedbackState.get('msg-1')?.rating).toBe('positive'));
  });

  it('rolls back optimistic update on error', async () => {
    // Seed with existing feedback
    mockApiFetch.mockResolvedValue([{ id: 'fb-1', messageId: 'msg-1', rating: 'positive' }]);

    const { result } = renderHook(() => useFeedback('thread-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.feedbackState.get('msg-1')?.rating).toBe('positive'));

    // POST fails, refetch returns original data
    mockApiFetch.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('network error'));
      return Promise.resolve([{ id: 'fb-1', messageId: 'msg-1', rating: 'positive' }]);
    });

    act(() => {
      result.current.handleFeedback('msg-1', 'negative');
    });

    // After error + rollback, should revert to original
    await waitFor(() => expect(result.current.feedbackState.get('msg-1')?.rating).toBe('positive'));
  });

  it('handles feedback with comment parameter', async () => {
    mockApiFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useFeedback('thread-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.feedbackState).toBeDefined());

    mockApiFetch.mockResolvedValue({});

    act(() => {
      result.current.handleFeedback('msg-1', 'negative', 'Not accurate');
    });

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: 'msg-1', rating: 'negative', comment: 'Not accurate' }),
      }),
    );
  });

  it('removes feedback entry with null rating via optimistic update', async () => {
    mockApiFetch.mockResolvedValue([{ id: 'fb-1', messageId: 'msg-1', rating: 'positive' }]);

    const { result } = renderHook(() => useFeedback('thread-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.feedbackState.get('msg-1')?.rating).toBe('positive'));

    mockApiFetch.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({});
      return Promise.resolve([]);
    });

    act(() => {
      result.current.handleFeedback('msg-1', null);
    });

    // Optimistic update should remove the entry
    await waitFor(() => expect(result.current.feedbackState.has('msg-1')).toBe(false));
  });
});
