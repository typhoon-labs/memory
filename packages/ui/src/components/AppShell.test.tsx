import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

afterEach(cleanup);

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
});
