import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { FeedbackPage } from './feedback';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('FeedbackPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<FeedbackPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders feedback rows when data loads', async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: 'fb-1',
        threadId: 'thread-abcd1234',
        messageId: 'msg-1',
        rating: 'positive',
        comment: 'Helpful!',
        createdAt: '2025-01-15T10:00:00Z',
      },
      {
        id: 'fb-2',
        threadId: 'thread-efgh5678',
        messageId: 'msg-2',
        rating: 'negative',
        comment: null,
        createdAt: '2025-01-14T10:00:00Z',
      },
    ]);
    renderWithQueryClient(<FeedbackPage />);
    await waitFor(() => {
      expect(screen.getByText('positive')).toBeTruthy();
      expect(screen.getByText('negative')).toBeTruthy();
      expect(screen.getByText('Helpful!')).toBeTruthy();
    });
  });

  it('shows empty state when no feedback', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<FeedbackPage />);
    await waitFor(() => expect(screen.getByText('No feedback yet')).toBeTruthy());
  });
});
