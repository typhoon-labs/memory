import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: { session: { id: 's-1' }, user: { id: 'u-1', email: 'test@test.com', role: 'admin' } },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    })),
    signOut: vi.fn().mockResolvedValue({}),
    $Infer: { Session: { session: {}, user: {} } },
  },
}));

import { AuthProvider, useAuth, useSignOut } from './auth-provider';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

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
});
