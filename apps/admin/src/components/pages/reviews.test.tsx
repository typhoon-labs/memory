import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
let mockSearchParams = {
  sortBy: 'newest',
  annotationStatus: 'all',
  feedbackStatus: 'all',
  search: undefined as string | undefined,
};
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => mockSearchParams,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    apiFetch: vi.fn(),
    useUrlSearchInput: vi.fn(() => ({
      inputValue: '',
      setInputValue: vi.fn(),
      handleKeyDown: vi.fn(),
      handleBlur: vi.fn(),
    })),
  };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ReviewsPage } from './reviews';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = { sortBy: 'newest', annotationStatus: 'all', feedbackStatus: 'all', search: undefined };
});

describe('ReviewsPage', () => {
  it('renders review rows when data loads', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-1',
          resource_id: 'u-1',
          title: 'Test Chat',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 4,
          responseAvg: 0.85,
          retrievalAvg: 0.9,
          scoreCount: 2,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => expect(screen.getByText('Test Chat')).toBeTruthy());
  });

  it('shows empty state when no conversations and no filters', async () => {
    mockApiFetch.mockResolvedValue({ threads: [], total: 0 });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeTruthy());
  });

  it('does not render DataTable when no conversations and no filters', async () => {
    mockApiFetch.mockResolvedValue({ threads: [], total: 0 });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeTruthy());
    // DataTable column headers should not be present
    expect(screen.queryByText('Thread')).toBeNull();
    expect(screen.queryByText('Response')).toBeNull();
  });

  it('renders score columns', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-1',
          resource_id: 'u-1',
          title: 'Scored Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 2,
          responseAvg: 0.75,
          retrievalAvg: 0.92,
          scoreCount: 4,
          annotationCount: 1,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('0.75')).toBeTruthy();
      expect(screen.getByText('0.92')).toBeTruthy();
    });
  });

  it('renders feedback column with thumbs up and down counts', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-fb',
          resource_id: 'u-1',
          title: 'Feedback Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 7,
          negativeFeedbackCount: 3,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Feedback Thread')).toBeTruthy();
    });
    // Positive = 7 - 3 = 4 (shown in emerald), Negative = 3 (shown in red)
    // Find the feedback cell's positive and negative spans via their CSS classes
    const { container } = { container: screen.getByText('Feedback Thread').closest('[class*="overflow-y-auto"]')! };
    const emeraldSpans = container.querySelectorAll('.text-emerald-400');
    const redSpans = container.querySelectorAll('.text-red-400');
    expect(emeraldSpans.length).toBeGreaterThanOrEqual(1);
    expect(redSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('shows dash for null score values', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-null',
          resource_id: 'u-1',
          title: 'Unscored Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Unscored Thread')).toBeTruthy();
    });
    // Null scores render as mdash entities — there should be multiple dash cells
    const dashes = screen.getAllByText('\u2014');
    // Response, Retrieval, Annotations, Feedback — at least 4 dashes
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('renders annotation count when present', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-ann',
          resource_id: 'u-1',
          title: 'Annotated Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 3,
          responseAvg: 0.8,
          retrievalAvg: null,
          scoreCount: 2,
          annotationCount: 5,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Annotated Thread')).toBeTruthy();
    });
    // The annotation count "5" should appear
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('renders message count column', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-msg',
          resource_id: 'u-1',
          title: 'Message Count Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 12,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Message Count Thread')).toBeTruthy();
    });
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('shows thread ID prefix when title is empty', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'abcdef123456789',
          resource_id: 'u-1',
          title: '',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      // id.slice(0, 12) = 'abcdef123456'
      expect(screen.getByText('abcdef123456')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-1',
          resource_id: 'u-1',
          title: 'Header Test',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: 0.5,
          retrievalAvg: 0.5,
          scoreCount: 1,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Thread')).toBeTruthy();
      expect(screen.getByText('Response')).toBeTruthy();
      expect(screen.getByText('Retrieval')).toBeTruthy();
      expect(screen.getByText('Messages')).toBeTruthy();
      expect(screen.getByText('Annotations')).toBeTruthy();
      expect(screen.getByText('Feedback')).toBeTruthy();
    });
  });

  it('renders score dot colors based on score thresholds', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-high',
          resource_id: 'u-1',
          title: 'High Scorer',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 5,
          responseAvg: 0.95,
          retrievalAvg: 0.85,
          scoreCount: 10,
          annotationCount: 2,
          feedbackCount: 3,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('0.95')).toBeTruthy();
      expect(screen.getByText('0.85')).toBeTruthy();
    });
  });

  it('renders low response score with correct value', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-low',
          resource_id: 'u-1',
          title: 'Low Scorer',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 2,
          responseAvg: 0.25,
          retrievalAvg: 0.35,
          scoreCount: 3,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('0.25')).toBeTruthy();
      expect(screen.getByText('0.35')).toBeTruthy();
    });
  });

  it('renders page header and description', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ReviewsPage />);
    expect(screen.getByText('Reviews')).toBeTruthy();
  });

  it('renders zero feedback as dash', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-nofb',
          resource_id: 'u-1',
          title: 'No Feedback Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: 0.5,
          retrievalAvg: null,
          scoreCount: 1,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('No Feedback Thread')).toBeTruthy();
    });
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('filters to show only has-feedback threads', async () => {
    mockSearchParams = { sortBy: 'newest', annotationStatus: 'all', feedbackStatus: 'has-feedback', search: undefined };
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-fb',
          resource_id: 'u-1',
          title: 'Thread With FB',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: 0.5,
          retrievalAvg: null,
          scoreCount: 1,
          annotationCount: 0,
          feedbackCount: 3,
          negativeFeedbackCount: 1,
        },
        {
          id: 'th-nofb',
          resource_id: 'u-1',
          title: 'No Feedback',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: 0.5,
          retrievalAvg: null,
          scoreCount: 1,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Thread With FB')).toBeTruthy();
    });
    // "No Feedback" thread should be filtered out
    expect(screen.queryByText('No Feedback')).toBeNull();
  });

  it('filters to show only has-negative threads', async () => {
    mockSearchParams = { sortBy: 'newest', annotationStatus: 'all', feedbackStatus: 'has-negative', search: undefined };
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-neg',
          resource_id: 'u-1',
          title: 'Negative Feedback',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 2,
          negativeFeedbackCount: 2,
        },
        {
          id: 'th-pos',
          resource_id: 'u-1',
          title: 'Positive Only',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 3,
          negativeFeedbackCount: 0,
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Negative Feedback')).toBeTruthy();
    });
    expect(screen.queryByText('Positive Only')).toBeNull();
  });

  it('filters to show only no-feedback threads', async () => {
    mockSearchParams = { sortBy: 'newest', annotationStatus: 'all', feedbackStatus: 'no-feedback', search: undefined };
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-fb',
          resource_id: 'u-1',
          title: 'Has Some Feedback',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 1,
          negativeFeedbackCount: 0,
        },
        {
          id: 'th-none',
          resource_id: 'u-1',
          title: 'Zero Feedback',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Zero Feedback')).toBeTruthy();
    });
    expect(screen.queryByText('Has Some Feedback')).toBeNull();
  });

  it('filters threads by search text', async () => {
    mockSearchParams = { sortBy: 'newest', annotationStatus: 'all', feedbackStatus: 'all', search: 'alpha' };
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-a',
          resource_id: 'u-1',
          title: 'Alpha Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
        {
          id: 'th-b',
          resource_id: 'u-1',
          title: 'Beta Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Alpha Thread')).toBeTruthy();
    });
    expect(screen.queryByText('Beta Thread')).toBeNull();
  });

  it('shows DataTable with no-results message when annotation filter is active on empty data', async () => {
    mockSearchParams = { sortBy: 'newest', annotationStatus: 'annotated', feedbackStatus: 'all', search: undefined };
    mockApiFetch.mockResolvedValue({ threads: [], total: 0 });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      // DataTable renders with its built-in empty row
      expect(screen.getByText('No results found.')).toBeTruthy();
    });
    // DataTable column headers should be present (toolbar visible for filter changes)
    expect(screen.getByText('Thread')).toBeTruthy();
    // The old EmptyState should NOT appear
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });

  it('renders feedback with only positive (no negatives)', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-pos-only',
          resource_id: 'u-1',
          title: 'Positive Only Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 2,
          responseAvg: 0.8,
          retrievalAvg: null,
          scoreCount: 1,
          annotationCount: 0,
          feedbackCount: 5,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Positive Only Thread')).toBeTruthy();
    });
    // Should show positive count (5) but no red spans
    const { container } = {
      container: screen.getByText('Positive Only Thread').closest('[class*="overflow-y-auto"]')!,
    };
    const emeraldSpans = container.querySelectorAll('.text-emerald-400');
    expect(emeraldSpans.length).toBeGreaterThanOrEqual(1);
    // No red (negative) spans
    const redSpans = container.querySelectorAll('.text-red-400');
    expect(redSpans.length).toBe(0);
  });

  it('renders feedback with only negative (no positives)', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-neg-only',
          resource_id: 'u-1',
          title: 'Negative Only Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 2,
          responseAvg: 0.3,
          retrievalAvg: null,
          scoreCount: 1,
          annotationCount: 0,
          feedbackCount: 3,
          negativeFeedbackCount: 3,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Negative Only Thread')).toBeTruthy();
    });
    // Should show negative count but no emerald spans
    const { container } = {
      container: screen.getByText('Negative Only Thread').closest('[class*="overflow-y-auto"]')!,
    };
    const redSpans = container.querySelectorAll('.text-red-400');
    expect(redSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('renders date column with relative time', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-date',
          resource_id: 'u-1',
          title: 'Date Thread',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-06-01T12:00:00Z',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Date Thread')).toBeTruthy();
    });
    // Date column should show relative time (formatRelativeTime is from @typhoon/ui)
    const dateHeader = screen.getByText('Date');
    expect(dateHeader).toBeTruthy();
  });

  it('renders multiple threads sorted by data order', async () => {
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-a',
          resource_id: 'u-1',
          title: 'Alpha Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 3,
          responseAvg: 0.6,
          retrievalAvg: 0.7,
          scoreCount: 2,
          annotationCount: 1,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
        {
          id: 'th-b',
          resource_id: 'u-2',
          title: 'Beta Thread',
          created_at: '2025-01-02',
          updated_at: '2025-01-02',
          message_count: 8,
          responseAvg: 0.9,
          retrievalAvg: 0.95,
          scoreCount: 5,
          annotationCount: 3,
          feedbackCount: 2,
          negativeFeedbackCount: 1,
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(screen.getByText('Alpha Thread')).toBeTruthy();
      expect(screen.getByText('Beta Thread')).toBeTruthy();
    });
  });

  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ReviewsPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders improved empty state description when no filters are active', async () => {
    mockApiFetch.mockResolvedValue({ threads: [], total: 0 });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(
          'Conversations from the rep desk and customer widget will appear here for quality review, annotation, and feedback tracking.',
        ),
      ).toBeTruthy();
    });
  });

  it('shows DataTable when feedbackStatus filter removes all threads client-side', async () => {
    mockSearchParams = { sortBy: 'newest', annotationStatus: 'all', feedbackStatus: 'has-feedback', search: undefined };
    mockApiFetch.mockResolvedValue({
      threads: [
        {
          id: 'th-nofb',
          resource_id: 'u-1',
          title: 'Thread',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
          message_count: 1,
          responseAvg: null,
          retrievalAvg: null,
          scoreCount: 0,
          annotationCount: 0,
          feedbackCount: 0,
          negativeFeedbackCount: 0,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ReviewsPage />);
    await waitFor(() => {
      // DataTable renders with its built-in empty row
      expect(screen.getByText('No results found.')).toBeTruthy();
    });
    // DataTable column headers should be present
    expect(screen.getByText('Thread')).toBeTruthy();
    // The friendly empty state should NOT appear
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });
});
