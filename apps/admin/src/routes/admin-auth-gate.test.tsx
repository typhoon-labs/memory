import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    AuthGate: ({ requiredRoles }: { requiredRoles: string[] }) => (
      <div data-testid="auth-gate" data-roles={requiredRoles.join(',')}>
        Auth Gate
      </div>
    ),
  };
});

import { AdminAuthGate } from './admin-auth-gate';

describe('AdminAuthGate', () => {
  it('renders AuthGate with admin role', () => {
    render(<AdminAuthGate />);
    expect(screen.getByTestId('auth-gate')).toBeTruthy();
    expect(screen.getByTestId('auth-gate').getAttribute('data-roles')).toContain('admin');
  });
});
