import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSessionMock = vi.fn(() => ({
  data: { session: { id: 's-1' }, user: { id: 'u-1', email: 'test@test.com', role: 'admin' } } as {
    session: { id: string };
    user: { id: string; email: string; role: string };
  } | null,
  isPending: false as boolean,
  error: null as Error | null,
  refetch: vi.fn(),
}));
const signOutMock = vi.fn().mockResolvedValue({});

vi.mock('./auth-client', () => ({
  authClient: {
    useSession: (...args: unknown[]) => useSessionMock(...(args as [])),
    signOut: (...args: unknown[]) => signOutMock(...(args as [])),
    $Infer: { Session: { session: {}, user: {} } },
  },
}));

import { AuthProvider, useAuth, useSignOut } from './auth-provider';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('AuthProvider', () => {
  it('provides session and user via useAuth', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toEqual(expect.objectContaining({ id: 'u-1' }));
    expect(result.current.session).toEqual(expect.objectContaining({ id: 's-1' }));
    expect(result.current.isPending).toBe(false);
  });

  it('useAuth throws outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within <AuthProvider>');
  });

  it('useSignOut returns a function', () => {
    const { result } = renderHook(() => useSignOut(), { wrapper });
    expect(typeof result.current).toBe('function');
  });

  it('provides error state when session fetch fails', () => {
    const err = new Error('session fetch failed');
    useSessionMock.mockReturnValue({ data: null, isPending: false, error: err, refetch: vi.fn() });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.error).toBe(err);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('provides isPending true when session is loading', () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true, error: null, refetch: vi.fn() });
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isPending).toBe(true);
  });

  it('useSignOut calls authClient.signOut and refetches session', async () => {
    const refetchMock = vi.fn();
    useSessionMock.mockReturnValue({
      data: { session: { id: 's-1' }, user: { id: 'u-1', email: 'test@test.com', role: 'admin' } },
      isPending: false,
      error: null,
      refetch: refetchMock,
    });
    const { result } = renderHook(() => useSignOut(), { wrapper });
    await act(() => result.current());
    expect(signOutMock).toHaveBeenCalled();
    expect(refetchMock).toHaveBeenCalled();
  });

  it('useSignOut refetches session even if signOut throws', async () => {
    const refetchMock = vi.fn();
    useSessionMock.mockReturnValue({
      data: { session: { id: 's-1' }, user: { id: 'u-1', email: 'test@test.com', role: 'admin' } },
      isPending: false,
      error: null,
      refetch: refetchMock,
    });
    signOutMock.mockRejectedValueOnce(new Error('sign out failed'));
    const { result } = renderHook(() => useSignOut(), { wrapper });
    await act(() => result.current().catch(() => {}));
    expect(refetchMock).toHaveBeenCalled();
  });
});
