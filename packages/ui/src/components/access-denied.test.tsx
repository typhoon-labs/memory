import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth-provider', () => ({
  useSignOut: vi.fn(() => vi.fn()),
}));

import { AccessDenied } from './access-denied';

afterEach(cleanup);

describe('AccessDenied', () => {
  it('renders "Access Denied" heading', () => {
    render(<AccessDenied />);
    expect(screen.getByText('Access Denied')).toBeTruthy();
  });

  it('shows email when provided', () => {
    render(<AccessDenied email="user@test.com" />);
    expect(screen.getByText(/user@test\.com/)).toBeTruthy();
  });

  it('renders sign out button', () => {
    render(<AccessDenied />);
    expect(screen.getByText('Sign out')).toBeTruthy();
  });
});
