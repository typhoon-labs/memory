import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ threadId: 'th-1' }),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('./review-detail/message-timeline', () => ({
  MessageTimeline: () => <div data-testid="message-timeline">Timeline</div>,
}));
vi.mock('@typhoon/chat', () => ({
  DocumentViewerPanel: () => null,
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ReviewDetailPage } from './review-detail';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('ReviewDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ReviewDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows not found when query errors', async () => {
    mockApiFetch.mockRejectedValue(new Error('not found'));
    renderWithQueryClient(<ReviewDetailPage />);
    await waitFor(() => expect(screen.getByText('Thread not found')).toBeTruthy());
  });

  it('renders review with messages', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'th-1',
      title: 'Test Conversation',
      createdAt: '2025-01-01T00:00:00Z',
      messages: [{ id: 'msg-1', role: 'user', content: 'Hi' }],
      scoresByMessage: {},
      feedbackByMessage: {},
    });
    renderWithQueryClient(<ReviewDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Test Conversation')).toBeTruthy();
      expect(screen.getByTestId('message-timeline')).toBeTruthy();
    });
  });

  it('shows empty state when no messages', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'th-1',
      title: 'Empty Thread',
      createdAt: '2025-01-01T00:00:00Z',
      messages: [],
      scoresByMessage: {},
      feedbackByMessage: {},
    });
    renderWithQueryClient(<ReviewDetailPage />);
    await waitFor(() => expect(screen.getByText('No messages')).toBeTruthy());
  });
});
