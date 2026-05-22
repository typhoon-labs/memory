import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => (
    <a href={to}>{typeof children === 'function' ? children({ isActive: false }) : children}</a>
  ),
  Outlet: () => <div data-testid="outlet">Outlet Content</div>,
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    useAuth: () => ({ user: { email: 'rep@typhoon.local' } }),
    useSignOut: () => vi.fn(),
    AppShell: ({
      children,
      logo,
      navGroups,
      userMenu,
      renderLink,
    }: {
      children: React.ReactNode;
      logo: React.ReactNode;
      navGroups: Array<{ items: Array<{ label: string; href: string; icon: React.ReactNode }> }>;
      userMenu: React.ReactNode;
      renderLink: (
        item: { label: string; href: string; icon: React.ReactNode },
        renderRow: (isActive: boolean) => React.ReactNode,
      ) => React.ReactNode;
    }) => (
      <div data-testid="app-shell">
        <div data-testid="logo">{logo}</div>
        <nav>
          {navGroups.map((g, i) => (
            <div key={i}>
              {g.items.map((item) => (
                <div key={item.href}>
                  {renderLink(item, (isActive) => (
                    <span className={isActive ? 'active' : ''}>{item.label}</span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div data-testid="user-menu">{userMenu}</div>
        {children}
      </div>
    ),
  };
});

import { DeskShell } from './desk-shell';

describe('DeskShell', () => {
  it('renders the shell layout with logo and outlet', () => {
    render(<DeskShell />);
    expect(screen.getByTestId('app-shell')).toBeTruthy();
    expect(screen.getByText('Typhoon')).toBeTruthy();
    expect(screen.getByTestId('outlet')).toBeTruthy();
  });

  it('renders all nav items', () => {
    render(<DeskShell />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('renders user menu with email', () => {
    render(<DeskShell />);
    expect(screen.getByText('R')).toBeTruthy();
    expect(screen.getByText('rep@typhoon.local')).toBeTruthy();
  });
});
