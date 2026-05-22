import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { NavGroup } from './AppShell';
import { AppShell } from './AppShell';

afterEach(cleanup);

const sampleNavGroups: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { label: 'Home', href: '/', isActive: true },
      { label: 'Settings', href: '/settings' },
    ],
  },
  {
    items: [{ label: 'Help', href: '/help' }],
  },
];

describe('AppShell', () => {
  it('renders children', () => {
    render(
      <AppShell navGroups={[]}>
        <div>Main content</div>
      </AppShell>,
    );
    expect(screen.getByText('Main content')).toBeTruthy();
  });

  it('renders with navigation groups', () => {
    const { container } = render(
      <AppShell navGroups={[{ items: [{ label: 'Home', href: '/' }] }]}>
        <div>Content</div>
      </AppShell>,
    );
    expect(container.querySelector('nav, aside, [role="navigation"]')).toBeTruthy();
  });

  it('applies h-full to direct children of main for scroll containment', () => {
    const { container } = render(
      <AppShell navGroups={[]}>
        <div data-testid="page">Page content</div>
      </AppShell>,
    );
    const main = container.querySelector('main');
    expect(main).toBeTruthy();
    expect(main?.className).toContain('[&>*]:h-full');
  });

  it('renders nav item labels in the sidebar', () => {
    render(
      <AppShell navGroups={sampleNavGroups}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Help').length).toBeGreaterThan(0);
  });

  it('renders nav group labels', () => {
    render(
      <AppShell navGroups={sampleNavGroups}>
        <div>Content</div>
      </AppShell>,
    );
    // The "Main" group heading should appear
    expect(screen.getAllByText('Main').length).toBeGreaterThan(0);
  });

  it('renders userMenu in the sidebar footer slot', () => {
    render(
      <AppShell navGroups={[]} userMenu={<div data-testid="user-menu">User Menu</div>}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getAllByTestId('user-menu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('User Menu').length).toBeGreaterThan(0);
  });

  it('renders logo in the header', () => {
    render(
      <AppShell navGroups={[]} logo={<span data-testid="logo">Typhoon</span>}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('logo')).toBeTruthy();
    expect(screen.getByText('Typhoon')).toBeTruthy();
  });

  it('renders topBarLeft and topBarRight', () => {
    render(
      <AppShell
        navGroups={[]}
        topBarLeft={<span data-testid="top-left">Search</span>}
        topBarRight={<span data-testid="top-right">Actions</span>}
      >
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByTestId('top-left')).toBeTruthy();
    expect(screen.getByTestId('top-right')).toBeTruthy();
  });

  it('toggles mobile sidebar when hamburger is clicked', () => {
    const { container } = render(
      <AppShell navGroups={sampleNavGroups}>
        <div>Content</div>
      </AppShell>,
    );
    // Initially the hamburger button says "Open navigation"
    const openBtn = screen.getByLabelText('Open navigation');
    expect(openBtn).toBeTruthy();

    // Click to open
    fireEvent.click(openBtn);

    // Now the button should say "Close navigation"
    const closeBtn = screen.getByLabelText('Close navigation');
    expect(closeBtn).toBeTruthy();

    // The mobile nav panel should be visible (pointer-events-auto)
    const mobilePanel = container.querySelector('.pointer-events-auto');
    expect(mobilePanel).toBeTruthy();
  });

  it('closes mobile sidebar when backdrop is clicked', () => {
    const { container } = render(
      <AppShell navGroups={sampleNavGroups}>
        <div>Content</div>
      </AppShell>,
    );
    // Open the sidebar
    fireEvent.click(screen.getByLabelText('Open navigation'));
    expect(screen.getByLabelText('Close navigation')).toBeTruthy();

    // Click the backdrop (opacity-100 element)
    const backdrop = container.querySelector('.opacity-100');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);

    // Sidebar should be closed now
    expect(screen.getByLabelText('Open navigation')).toBeTruthy();
  });

  it('renders bottomNavGroups above the user menu', () => {
    render(
      <AppShell
        navGroups={[{ items: [{ label: 'Dashboard', href: '/dash' }] }]}
        bottomNavGroups={[{ items: [{ label: 'Logout', href: '/logout' }] }]}
        userMenu={<div data-testid="user-menu">User</div>}
      >
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Logout').length).toBeGreaterThan(0);
  });

  it('applies custom className to outermost wrapper', () => {
    const { container } = render(
      <AppShell navGroups={[]} className="my-custom-shell">
        <div>Content</div>
      </AppShell>,
    );
    expect(container.querySelector('.my-custom-shell')).toBeTruthy();
  });

  it('uses custom renderLink for navigation items', () => {
    const { container } = render(
      <AppShell
        navGroups={[{ items: [{ label: 'Custom', href: '/custom' }] }]}
        renderLink={(item, renderRow) => (
          <a href={item.href} data-testid="custom-link">
            {renderRow(item.isActive ?? false)}
          </a>
        )}
      >
        <div>Content</div>
      </AppShell>,
    );
    const customLinks = container.querySelectorAll('[data-testid="custom-link"]');
    expect(customLinks.length).toBeGreaterThan(0);
  });
});
