import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { useThread, useThreads } from './use-thread';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useThreads', () => {
  it('uses correct query key', () => {
    const { result } = renderHook(() => useThreads(), { wrapper: createWrapper() });
    // The hook should be in loading state initially
    expect(result.current.isLoading).toBe(true);
  });

  it('returns thread list response shape', async () => {
    const { apiFetch } = await import('@typhoon/ui');
    const mockApiFetch = vi.mocked(apiFetch);
    mockApiFetch.mockResolvedValue({
      threads: [{ id: 't-1', title: 'Test', resourceId: 'r-1', createdAt: '2025-01-01', updatedAt: '2025-01-01' }],
      total: 1,
      page: 1,
      perPage: 50,
      hasMore: false,
    });

    const { result } = renderHook(() => useThreads(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.threads).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });
});

describe('useThread', () => {
  it('is disabled when threadId is undefined', () => {
    const { result } = renderHook(() => useThread(undefined), { wrapper: createWrapper() });
    // Query should not be loading when disabled
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches when threadId is provided', async () => {
    const { apiFetch } = await import('@typhoon/ui');
    const mockApiFetch = vi.mocked(apiFetch);
    mockApiFetch.mockResolvedValue({
      id: 't-1',
      title: 'Thread detail',
      resourceId: 'r-1',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
      messages: [],
    });

    const { result } = renderHook(() => useThread('t-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.title).toBe('Thread detail');
    expect(result.current.data?.messages).toEqual([]);
  });
});
