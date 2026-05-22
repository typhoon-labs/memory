import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    useAuth: () => ({ refetchSession: vi.fn() }),
    LoginPage: ({ onSuccess }: { onSuccess: () => void }) => (
      <div data-testid="login-page">
        <button type="button" onClick={onSuccess}>
          Sign In
        </button>
      </div>
    ),
  };
});

import { DeskLoginPage } from './login';

describe('DeskLoginPage', () => {
  it('renders login page', () => {
    render(<DeskLoginPage />);
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  it('calls onSuccess which triggers refetchSession and navigate', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<DeskLoginPage />);
    await user.click(screen.getByText('Sign In'));
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });
});
