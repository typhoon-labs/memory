import { screen, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to} data-testid="router-link">
      {children}
    </a>
  ),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual };
});

import { QuickAccess } from './quick-access';

describe('QuickAccess', () => {
  it('renders "New chat" button', () => {
    render(<QuickAccess />);
    expect(screen.getByText('New chat')).toBeTruthy();
  });

  it('renders "Search KB" button', () => {
    render(<QuickAccess />);
    expect(screen.getByText('Search KB')).toBeTruthy();
  });

  it('links to correct routes', () => {
    render(<QuickAccess />);
    const links = screen.getAllByTestId('router-link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/chat');
    expect(hrefs).toContain('/search');
  });
});
