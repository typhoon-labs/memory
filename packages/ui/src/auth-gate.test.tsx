import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div>Outlet content</div>,
  useNavigate: () => navigateMock,
}));

const useAuthMock = vi.fn(() => ({
  user: { id: 'u-1', email: 'admin@test.com', role: 'admin' } as { id: string; email: string; role: string } | null,
  isPending: false as boolean,
  error: null as Error | null,
}));
vi.mock('./auth-provider', () => ({
  useAuth: (...args: unknown[]) => useAuthMock(...(args as [])),
}));

vi.mock('./components/access-denied', () => ({
  AccessDenied: ({ email }: { email: string }) => <div>Access Denied for {email}</div>,
}));

import { AuthGate } from './auth-gate';

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('AuthGate', () => {
  it('renders Outlet when user is authenticated', () => {
    render(<AuthGate />);
    expect(screen.getByText('Outlet content')).toBeTruthy();
  });

  it('renders Outlet when user has required role', () => {
    render(<AuthGate requiredRoles={['admin']} />);
    expect(screen.getByText('Outlet content')).toBeTruthy();
  });

  it('shows Loading... while session is pending', () => {
    useAuthMock.mockReturnValue({ user: null, isPending: true, error: null });
    render(<AuthGate />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows Connecting... on network error', () => {
    useAuthMock.mockReturnValue({ user: null, isPending: false, error: new Error('fetch failed') });
    render(<AuthGate />);
    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('renders AccessDenied when user lacks required role', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-2', email: 'rep@test.com', role: 'rep' },
      isPending: false,
      error: null,
    });
    render(<AuthGate requiredRoles={['admin']} />);
    expect(screen.getByText('Access Denied for rep@test.com')).toBeTruthy();
  });

  it('redirects to /login when no user and no network error', () => {
    useAuthMock.mockReturnValue({ user: null, isPending: false, error: null });
    render(<AuthGate />);
    expect(navigateMock).toHaveBeenCalledWith({ to: '/login' });
  });
});
