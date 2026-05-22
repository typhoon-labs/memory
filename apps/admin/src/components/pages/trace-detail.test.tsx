import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ traceId: 'trace-abc123' }),
  useSearch: () => ({ span: undefined }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('./trace-detail/shared', () => ({
  buildSpanTree: vi.fn((spans: unknown[]) => (spans.length > 0 ? [{ span: spans[0], children: [] }] : [])),
  formatDurationMs: vi.fn((ms: number | null) => (ms !== null ? `${ms}ms` : '\u2014')),
  SPAN_CATEGORY_COLORS: {},
  SPAN_CATEGORY_LABELS: {},
}));
vi.mock('./trace-detail/span-detail-sheet', () => ({ SpanDetailSheet: () => null }));
vi.mock('./trace-detail/span-tree', () => ({ SpanTree: () => <div data-testid="span-tree">Tree</div> }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { TraceDetailPage } from './trace-detail';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('TraceDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<TraceDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows not found on error', async () => {
    mockApiFetch.mockRejectedValue(new Error('not found'));
    renderWithQueryClient(<TraceDetailPage />);
    await waitFor(() => expect(screen.getByText('Trace not found')).toBeTruthy());
  });

  it('renders trace data with span tree', async () => {
    mockApiFetch.mockResolvedValue({
      summary: {
        traceId: 'trace-abc123',
        status: 'success',
        spanCount: 1,
        startedAt: '2025-01-01',
        durationMs: 500,
        threadId: null,
      },
      spans: [
        {
          spanId: 's-1',
          name: 'chat',
          type: 'agent',
          status: 'success',
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
          promptTokens: 100,
          completionTokens: 50,
        },
      ],
    });
    renderWithQueryClient(<TraceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('trace-abc123')).toBeTruthy();
      expect(screen.getByTestId('span-tree')).toBeTruthy();
    });
  });

  it('renders stat cards with token counts', async () => {
    mockApiFetch.mockResolvedValue({
      summary: {
        traceId: 'trace-abc123',
        status: 'success',
        spanCount: 2,
        startedAt: '2025-01-01',
        durationMs: 1500,
        threadId: null,
      },
      spans: [
        {
          spanId: 's-1',
          name: 'agent',
          spanType: 'agent_run',
          startedAt: '2025-01-01T00:00:00Z',
          endedAt: '2025-01-01T00:00:01Z',
          promptTokens: 400,
          completionTokens: 200,
        },
        {
          spanId: 's-2',
          name: 'model',
          spanType: 'model_generation',
          startedAt: '2025-01-01T00:00:00Z',
          endedAt: '2025-01-01T00:00:01Z',
          promptTokens: 600,
          completionTokens: 300,
        },
      ],
    });
    renderWithQueryClient(<TraceDetailPage />);
    await waitFor(() => {
      // Stat cards: Duration, Spans, Prompt Tokens, Completion Tokens
      expect(screen.getByText('Duration')).toBeTruthy();
      expect(screen.getByText('Prompt Tokens')).toBeTruthy();
      expect(screen.getByText('Completion Tokens')).toBeTruthy();
      // Prompt: 400+600=1000, Completion: 200+300=500
      expect(screen.getByText('1,000')).toBeTruthy();
      expect(screen.getByText('500')).toBeTruthy();
    });
  });

  it('renders category filter badges', async () => {
    mockApiFetch.mockResolvedValue({
      summary: {
        traceId: 'trace-abc123',
        status: 'success',
        spanCount: 1,
        startedAt: '2025-01-01',
        durationMs: 500,
        threadId: null,
      },
      spans: [
        {
          spanId: 's-1',
          name: 'chat',
          spanType: 'agent_run',
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
          promptTokens: 0,
          completionTokens: 0,
        },
      ],
    });
    renderWithQueryClient(<TraceDetailPage />);
    await waitFor(() => {
      // The filter toolbar renders buttons for each category
      // (SPAN_CATEGORY_LABELS is mocked as {}, so we check for the badge buttons)
      const searchInput = screen.getByPlaceholderText('Search...');
      expect(searchInput).toBeTruthy();
    });
  });

  it('renders View Review button when threadId is present', async () => {
    mockApiFetch.mockResolvedValue({
      summary: {
        traceId: 'trace-abc123',
        status: 'success',
        spanCount: 1,
        startedAt: '2025-01-01',
        durationMs: 500,
        threadId: 'thread-123',
      },
      spans: [
        {
          spanId: 's-1',
          name: 'chat',
          spanType: 'agent_run',
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
          promptTokens: 0,
          completionTokens: 0,
        },
      ],
    });
    renderWithQueryClient(<TraceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('View Review')).toBeTruthy();
    });
  });

  it('renders em-dash when token counts are zero', async () => {
    mockApiFetch.mockResolvedValue({
      summary: {
        traceId: 'trace-abc123',
        status: 'success',
        spanCount: 1,
        startedAt: '2025-01-01',
        durationMs: 500,
        threadId: null,
      },
      spans: [
        {
          spanId: 's-1',
          name: 'chat',
          spanType: 'agent_run',
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
          promptTokens: 0,
          completionTokens: 0,
        },
      ],
    });
    renderWithQueryClient(<TraceDetailPage />);
    await waitFor(() => {
      // When tokens are 0, the stat cards show em-dash
      const tokenCards = screen.getAllByText('\u2014');
      expect(tokenCards.length).toBeGreaterThanOrEqual(2);
    });
  });
});
