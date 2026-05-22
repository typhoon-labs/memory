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
    useAuth: () => ({ user: { email: 'admin@typhoon.local' } }),
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
      navGroups: Array<{ label: string; items: Array<{ label: string; href: string; icon: React.ReactNode }> }>;
      userMenu: React.ReactNode;
      renderLink: (
        item: { label: string; href: string; icon: React.ReactNode },
        renderRow: (isActive: boolean) => React.ReactNode,
      ) => React.ReactNode;
    }) => (
      <div data-testid="app-shell">
        <div data-testid="logo">{logo}</div>
        <nav>
          {navGroups.map((g) => (
            <div key={g.label}>
              <span>{g.label}</span>
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
vi.mock('../features/queues/use-queue-events', () => ({
  useQueueEvents: vi.fn(),
}));

import { AdminShell } from './admin-shell';

describe('AdminShell', () => {
  it('renders the shell layout with logo, nav groups, and user menu', () => {
    render(<AdminShell />);
    expect(screen.getByTestId('app-shell')).toBeTruthy();
    expect(screen.getByTestId('logo')).toBeTruthy();
    expect(screen.getByText('Typhoon')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByTestId('outlet')).toBeTruthy();
  });

  it('renders all nav groups', () => {
    render(<AdminShell />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.getByText('Metadata')).toBeTruthy();
    expect(screen.getByText('Quality')).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();
  });

  it('renders nav items as links', () => {
    render(<AdminShell />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Sync Sources')).toBeTruthy();
    expect(screen.getByText('Documents')).toBeTruthy();
    expect(screen.getByText('Reviews')).toBeTruthy();
    expect(screen.getByText('Queues')).toBeTruthy();
  });

  it('renders user menu with email initial', () => {
    render(<AdminShell />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('admin@typhoon.local')).toBeTruthy();
  });
});
