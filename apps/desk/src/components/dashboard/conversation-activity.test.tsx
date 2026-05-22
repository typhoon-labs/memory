import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={`${to}/${params?.threadId ?? ''}`} data-testid="router-link">
      {children}
    </a>
  ),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    formatRelativeTime: (ts: string) => `relative(${ts})`,
    Skeleton: () => <div data-testid="skeleton" />,
  };
});

import { render } from '@testing-library/react';

import { ConversationActivity } from './conversation-activity';

describe('ConversationActivity', () => {
  it('shows skeletons when loading', () => {
    render(<ConversationActivity threads={[]} isLoading={true} />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons).toHaveLength(4);
  });

  it('shows empty state when no threads', () => {
    render(<ConversationActivity threads={[]} isLoading={false} />);
    expect(screen.getByText('No conversations yet')).toBeTruthy();
  });

  it('renders thread links', () => {
    const threads = [
      {
        id: 't-1',
        title: 'First Chat',
        resourceId: 'r-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T12:00:00Z',
      },
      {
        id: 't-2',
        title: 'Second Chat',
        resourceId: 'r-2',
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-02T12:00:00Z',
      },
    ];
    render(<ConversationActivity threads={threads} isLoading={false} />);
    expect(screen.getByText('First Chat')).toBeTruthy();
    expect(screen.getByText('Second Chat')).toBeTruthy();
    const links = screen.getAllByTestId('router-link');
    expect(links).toHaveLength(2);
  });

  it('shows "Untitled" for threads without titles', () => {
    const threads = [
      { id: 't-1', title: '', resourceId: 'r-1', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T12:00:00Z' },
    ];
    render(<ConversationActivity threads={threads} isLoading={false} />);
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('only shows first 7 threads', () => {
    const threads = Array.from({ length: 10 }, (_, i) => ({
      id: `t-${i}`,
      title: `Thread ${i}`,
      resourceId: `r-${i}`,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }));
    render(<ConversationActivity threads={threads} isLoading={false} />);
    const links = screen.getAllByTestId('router-link');
    expect(links).toHaveLength(7);
  });
});
