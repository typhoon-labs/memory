import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-client', () => ({
  authClient: {
    signIn: { social: vi.fn().mockResolvedValue({}) },
  },
}));

import { LoginPage } from './login-page';

afterEach(cleanup);

describe('LoginPage', () => {
  it('renders the sign-in button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in with SSO')).toBeTruthy();
  });

  it('renders the Typhoon logo', () => {
    render(<LoginPage />);
    expect(screen.getByText('Typhoon')).toBeTruthy();
  });
});
