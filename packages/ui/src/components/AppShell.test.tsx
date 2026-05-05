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
});
