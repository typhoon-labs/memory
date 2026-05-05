import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div>Outlet content</div>,
  useNavigate: () => vi.fn(),
}));

vi.mock('./auth-provider', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'u-1', email: 'admin@test.com', role: 'admin' },
    isPending: false,
    error: null,
  })),
}));

vi.mock('./components/access-denied', () => ({
  AccessDenied: () => <div>Access Denied</div>,
}));

import { AuthGate } from './auth-gate';

afterEach(cleanup);

describe('AuthGate', () => {
  it('renders Outlet when user is authenticated', () => {
    render(<AuthGate />);
    expect(screen.getByText('Outlet content')).toBeTruthy();
  });

  it('renders Outlet when user has required role', () => {
    render(<AuthGate requiredRoles={['admin']} />);
    expect(screen.getByText('Outlet content')).toBeTruthy();
  });
});
