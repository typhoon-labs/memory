import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSearchParams: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ experimentId: 'exp-1' }),
  useSearch: () => mockSearchParams,
  useNavigate: () => vi.fn(),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('@typhoon/evals/scorer-categories', () => ({
  computeCategoryAverages: vi.fn((scores: Array<{ scorerId: string; score: number | null }>) => {
    const valid = scores.filter((s) => s.score !== null);
    if (valid.length === 0) return { responseAvg: null, retrievalAvg: null };
    const avg = valid.reduce((sum, s) => sum + (s.score ?? 0), 0) / valid.length;
    return { responseAvg: avg, retrievalAvg: null };
  }),
  normalizeScoreForAvg: vi.fn((_sid: string, v: number) => v),
  SCORER_CATEGORIES: {},
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ExperimentDetailPage } from './experiment-detail';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = {};
});

describe('ExperimentDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ExperimentDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows not found when experiment missing', async () => {
    mockApiFetch.mockResolvedValue(null);
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => expect(screen.getByText('Experiment not found')).toBeTruthy());
  });

  it('renders experiment name and status', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Test Run',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 10,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Test Run')).toBeTruthy();
      expect(screen.getByText('completed')).toBeTruthy();
    });
  });

  it('renders progress bar when experiment is running', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Running Exp',
        status: 'running',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 3,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    const { container } = renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('running')).toBeTruthy();
    });
    // Progress bar: outer div has bg-muted and inner has bg-primary with width style
    const progressOuter = container.querySelector('.bg-muted.h-0\\.5');
    expect(progressOuter).toBeTruthy();
  });

  it('renders Cancel button when experiment is running', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Running Exp',
        status: 'running',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 3,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  it('renders Compare button when experiment is completed', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Completed Exp',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 10,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Compare')).toBeTruthy();
    });
  });

  it('does not render Compare button when experiment is running', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Running',
        status: 'running',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 2,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('running')).toBeTruthy();
    });
    expect(screen.queryByText('Compare')).toBeFalsy();
  });

  it('shows empty state when no results and not running', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Failed Exp',
        status: 'failed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 0,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No results yet')).toBeTruthy();
    });
  });

  it('shows processing message when running with no results', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Starting',
        status: 'running',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 0,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Processing items... results will appear shortly.')).toBeTruthy();
    });
  });

  it('renders description with item counts and duration', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Full Run',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 20,
        succeededCount: 18,
        failedCount: 2,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:02:30Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      // Description includes item counts
      expect(screen.getByText(/20\/20 items/)).toBeTruthy();
    });
  });

  it('renders breadcrumb link to experiments list', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Test',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Experiments')).toBeTruthy();
    });
  });

  it('does not render Cancel button when experiment is completed', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Done',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 10,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
    });
    expect(screen.queryByText('Cancel')).toBeFalsy();
  });

  it('does not render Cancel button when experiment is pending', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Pending',
        status: 'pending',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 0,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: null,
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('pending')).toBeTruthy();
    });
    expect(screen.queryByText('Cancel')).toBeFalsy();
  });

  it('renders description with passed and failed counts', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Mixed',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 7,
        failedCount: 3,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:01:00Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/10\/10 items/)).toBeTruthy();
      expect(screen.getByText(/7 passed/)).toBeTruthy();
      expect(screen.getByText(/3 failed/)).toBeTruthy();
    });
  });

  it('renders description with duration for completed experiment', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Timed',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:05:30Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/5m 30s/)).toBeTruthy();
    });
  });

  it('renders results table when results exist', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'With Results',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 2,
        succeededCount: 2,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:01:00Z',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-1',
            itemId: 'item-1',
            input: { question: 'What is Typhoon?' },
            groundTruth: null,
            output: { responseText: 'Typhoon is an AI chatbot.', scores: [] },
            error: null,
          },
          {
            id: 'r-2',
            itemId: 'item-2',
            input: { question: 'How does it work?' },
            groundTruth: null,
            output: { responseText: 'It uses RAG.', scores: [] },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      // Table column headers
      expect(screen.getByText('Input')).toBeTruthy();
    });
    // Result data should be visible (truncated)
    expect(screen.getByText(/What is Typhoon/)).toBeTruthy();
    expect(screen.getByText(/How does it work/)).toBeTruthy();
  });

  it('renders experiment ID prefix when name is null', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'abcdefgh12345678',
        name: null,
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Experiment abcdefgh/)).toBeTruthy();
    });
  });

  it('renders status badge variants for different statuses', async () => {
    // Test with failed status
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Failed Exp',
        status: 'failed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 0,
        failedCount: 10,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('failed')).toBeTruthy();
    });
  });

  it('renders progress bar with correct percentage', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Half Done',
        status: 'running',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 4,
        failedCount: 1,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    const { container } = renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('running')).toBeTruthy();
    });
    // Progress should be 50% (5 out of 10)
    const progressBar = container.querySelector('.bg-primary');
    expect(progressBar).toBeTruthy();
    expect((progressBar as HTMLElement).style.width).toBe('50%');
  });

  it('shows only succeeded count when no failures', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Success Only',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 5,
        succeededCount: 5,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:00:30Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/5 passed/)).toBeTruthy();
    });
    // Should not show "0 failed"
    expect(screen.queryByText(/0 failed/)).toBeFalsy();
  });

  it('does not show progress bar when experiment is completed', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'All Done',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 10,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    const { container } = renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
    });
    const progressOuter = container.querySelector('.bg-muted.h-0\\.5');
    expect(progressOuter).toBeFalsy();
  });

  it('renders results table with response column', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Table Test',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-1',
            itemId: 'item-1',
            input: 'What is AI?',
            groundTruth: null,
            output: { responseText: 'AI is artificial intelligence.', scores: [] },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      // Response column header exists (two: one for text, one for avg)
      const responseHeaders = screen.getAllByText('Response');
      expect(responseHeaders.length).toBeGreaterThanOrEqual(1);
    });
    // The truncated response text
    expect(screen.getByText(/AI is artificial intelligence/)).toBeTruthy();
  });

  it('renders results table with result ID in row data', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'With IDs',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-unique-123',
            itemId: 'item-1',
            input: { question: 'Unique question for test' },
            groundTruth: null,
            output: { responseText: 'Response text here', scores: [] },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Unique question for test/)).toBeTruthy();
    });
    // The response text should appear in the Response column
    expect(screen.getByText(/Response text here/)).toBeTruthy();
  });

  it('renders Retrieval column header in results table', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Retrieval Col',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-1',
            itemId: 'item-1',
            input: 'Test',
            groundTruth: null,
            output: { responseText: 'Test', scores: [] },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Retrieval')).toBeTruthy();
    });
  });

  it('renders short duration (seconds only)', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Quick',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:00:45Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/45s/)).toBeTruthy();
    });
  });

  it('does not show duration when startedAt or completedAt is null', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'No Duration',
        status: 'running',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 2,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('running')).toBeTruthy();
    });
    // Duration format patterns should not appear in description (no Xm Xs or Xh Xm)
    expect(screen.queryByText(/\d+m \d+s/)).toBeFalsy();
  });

  it('renders hour-long duration format', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Long Run',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 100,
        succeededCount: 100,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T01:30:00Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/1h 30m/)).toBeTruthy();
    });
  });

  it('renders sub-second duration in milliseconds', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Fast Run',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:00.500Z',
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/500ms/)).toBeTruthy();
    });
  });

  it('renders results table with responseAvg column values', async () => {
    vi.mocked((await import('@typhoon/evals/scorer-categories')).computeCategoryAverages).mockReturnValue({
      responseAvg: 0.78,
      retrievalAvg: 0.65,
    });

    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Score Test',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-1',
            itemId: 'item-1',
            input: 'Test input',
            groundTruth: null,
            output: {
              responseText: 'Test response',
              scores: [{ scorerId: 'accuracy', score: 0.78 }],
            },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('0.78')).toBeTruthy();
      expect(screen.getByText('0.65')).toBeTruthy();
    });
  });

  it('renders N/A for null retrievalAvg in results', async () => {
    vi.mocked((await import('@typhoon/evals/scorer-categories')).computeCategoryAverages).mockReturnValue({
      responseAvg: 0.5,
      retrievalAvg: null,
    });

    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'NA Retrieval',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-1',
            itemId: 'item-1',
            input: 'Test',
            groundTruth: null,
            output: { responseText: 'Response', scores: [] },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeTruthy();
    });
  });

  it('renders description without startedAt (pending experiment)', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Pending Run',
        status: 'pending',
        datasetId: 'ds-1',
        totalItems: 10,
        succeededCount: 0,
        failedCount: 0,
        createdAt: '2025-06-01T00:00:00Z',
        startedAt: null,
        completedAt: null,
      })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/0\/10 items/)).toBeTruthy();
    });
  });

  it('renders results with scores triggering score column cells', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Scored Results',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-scored',
            itemId: 'item-1',
            input: 'Scored question',
            groundTruth: null,
            output: {
              responseText: 'Scored response',
              scores: [
                { scorerId: 'accuracy', score: 0.85 },
                { scorerId: 'fluency', score: 0.75 },
              ],
            },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Scored question/)).toBeTruthy();
    });
  });

  it('renders results with input object containing question key', async () => {
    vi.mocked((await import('@typhoon/evals/scorer-categories')).computeCategoryAverages).mockReturnValue({
      responseAvg: null,
      retrievalAvg: null,
    });

    mockApiFetch
      .mockResolvedValueOnce({
        id: 'exp-1',
        name: 'Object Input',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r-obj',
            itemId: 'item-1',
            input: { question: 'What is Typhoon platform?' },
            groundTruth: null,
            output: { responseText: 'Typhoon is an AI chatbot platform.', scores: [] },
            error: null,
          },
        ],
      })
      .mockResolvedValueOnce({ scorers: [], total: 0 });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/What is Typhoon platform/)).toBeTruthy();
    });
  });

  it('renders ResultDetailSheet when result param is set', async () => {
    mockSearchParams = { result: 'r-detail' };

    vi.mocked((await import('@typhoon/evals/scorer-categories')).computeCategoryAverages).mockReturnValue({
      responseAvg: 0.75,
      retrievalAvg: null,
    });

    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/results')) {
        return Promise.resolve({
          results: [
            {
              id: 'r-detail',
              itemId: 'item-1',
              input: 'What are the benefits?',
              groundTruth: 'Expected answer about benefits',
              output: {
                responseText: 'The company offers health and dental benefits.',
                scores: [
                  { scorerId: 'faithfulness', score: 0.85, reason: 'Good adherence to source', name: 'faithfulness' },
                  { scorerId: 'answerRelevancy', score: 0.7, reason: 'Mostly relevant', name: 'answerRelevancy' },
                ],
              },
              error: null,
            },
          ],
        });
      }
      if (String(url).includes('/scorers')) {
        return Promise.resolve({
          scorers: [
            {
              id: 's1',
              name: 'faithfulness',
              description: 'Measures faithfulness',
              type: 'faithfulness',
              status: 'active',
            },
            {
              id: 's2',
              name: 'answerRelevancy',
              description: 'Measures relevance',
              type: 'answerRelevancy',
              status: 'active',
            },
          ],
          total: 2,
        });
      }
      return Promise.resolve({
        id: 'exp-1',
        name: 'Detail Test',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 1,
        failedCount: 0,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      // Detail sheet should show the input as title (may appear in table + sheet)
      expect(screen.getAllByText(/What are the benefits/).length).toBeGreaterThanOrEqual(1);
    });
    // Details tab content — "Input" appears as column header + section label
    expect(screen.getAllByText('Input').length).toBeGreaterThanOrEqual(2);
    // Ground truth section
    expect(screen.getByText('Expected')).toBeTruthy();
    expect(screen.getAllByText(/Expected answer about benefits/).length).toBeGreaterThanOrEqual(1);
    // Response section (may appear in table row + sheet detail)
    expect(screen.getAllByText(/health and dental benefits/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders ResultDetailSheet with error result', async () => {
    mockSearchParams = { result: 'r-err' };

    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/results')) {
        return Promise.resolve({
          results: [
            {
              id: 'r-err',
              itemId: 'item-1',
              input: 'Error input',
              groundTruth: null,
              output: null,
              error: { message: 'LLM timeout after 30s' },
            },
          ],
        });
      }
      if (String(url).includes('/scorers')) return Promise.resolve({ scorers: [], total: 0 });
      return Promise.resolve({
        id: 'exp-1',
        name: 'Error Test',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 0,
        failedCount: 1,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeTruthy();
      expect(screen.getByText('LLM timeout after 30s')).toBeTruthy();
    });
  });

  it('renders ResultDetailSheet with string error', async () => {
    mockSearchParams = { result: 'r-str-err' };

    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/results')) {
        return Promise.resolve({
          results: [
            {
              id: 'r-str-err',
              itemId: 'item-1',
              input: 'String error input',
              groundTruth: null,
              output: null,
              error: 'A plain string error message',
            },
          ],
        });
      }
      if (String(url).includes('/scorers')) return Promise.resolve({ scorers: [], total: 0 });
      return Promise.resolve({
        id: 'exp-1',
        name: 'String Error Test',
        status: 'completed',
        datasetId: 'ds-1',
        totalItems: 1,
        succeededCount: 0,
        failedCount: 1,
        createdAt: '2025-01-01',
        startedAt: '2025-01-01',
        completedAt: '2025-01-01',
      });
    });
    renderWithQueryClient(<ExperimentDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('A plain string error message')).toBeTruthy();
    });
  });
});
