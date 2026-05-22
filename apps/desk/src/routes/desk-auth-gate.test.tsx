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

import { DeskAuthGate } from './desk-auth-gate';

describe('DeskAuthGate', () => {
  it('renders AuthGate with admin and rep roles', () => {
    render(<DeskAuthGate />);
    expect(screen.getByTestId('auth-gate')).toBeTruthy();
    const roles = screen.getByTestId('auth-gate').getAttribute('data-roles') ?? '';
    expect(roles).toContain('admin');
    expect(roles).toContain('rep');
  });
});
