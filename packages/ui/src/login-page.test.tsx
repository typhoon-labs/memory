import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const socialMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('./auth-client', () => ({
  authClient: {
    signIn: { social: socialMock },
  },
}));

import { LoginPage } from './login-page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('renders the sign-in button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in with SSO')).toBeTruthy();
  });

  it('renders the Typhoon logo', () => {
    render(<LoginPage />);
    expect(screen.getByText('Typhoon')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in to continue')).toBeTruthy();
  });

  it('calls authClient.signIn.social on SSO button click', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText('Sign in with SSO'));
    expect(socialMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'oidc' }));
  });

  it('calls onSuccess callback after successful sign-in', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LoginPage onSuccess={onSuccess} />);
    await user.click(screen.getByText('Sign in with SSO'));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('displays error message when sign-in fails', async () => {
    socialMock.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText('Sign in with SSO'));
    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('displays generic error for non-Error throwables', async () => {
    socialMock.mockRejectedValueOnce('unknown');
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText('Sign in with SSO'));
    expect(screen.getByText('SSO sign-in failed')).toBeTruthy();
  });
});
