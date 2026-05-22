import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => ({}),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('./trace-detail/shared', () => ({
  formatDurationMs: vi.fn((ms: number | null) => (ms !== null ? `${ms}ms` : '\u2014')),
}));
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
import { TracesPage } from './traces';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('TracesPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<TracesPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders trace rows when data loads', async () => {
    mockApiFetch.mockResolvedValue({
      traces: [
        {
          traceId: 'trace-abc',
          rootSpanName: 'chat',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'success',
          spanCount: 5,
          durationMs: 1200,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
      ],
      total: 1,
      page: 1,
      perPage: 200,
      hasMore: false,
    });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => expect(screen.getByText('trace-abc')).toBeTruthy());
  });

  it('shows empty state when no traces', async () => {
    mockApiFetch.mockResolvedValue({ traces: [], total: 0, page: 1, perPage: 200, hasMore: false });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => expect(screen.getByText('No traces found')).toBeTruthy());
  });

  it('renders duration column display', async () => {
    mockApiFetch.mockResolvedValue({
      traces: [
        {
          traceId: 'trace-dur',
          rootSpanName: 'chat',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'success',
          spanCount: 3,
          durationMs: 2500,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
      ],
      total: 1,
      page: 1,
      perPage: 200,
      hasMore: false,
    });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => {
      // formatDurationMs mock returns '2500ms'
      expect(screen.getByText('2500ms')).toBeTruthy();
    });
  });

  it('renders status badge variants', async () => {
    mockApiFetch.mockResolvedValue({
      traces: [
        {
          traceId: 'tr-ok',
          rootSpanName: 'a',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'success',
          spanCount: 1,
          durationMs: 100,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
        {
          traceId: 'tr-err',
          rootSpanName: 'b',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'error',
          spanCount: 2,
          durationMs: 200,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
        {
          traceId: 'tr-part',
          rootSpanName: 'c',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'partial',
          spanCount: 3,
          durationMs: 300,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
      ],
      total: 3,
      page: 1,
      perPage: 200,
      hasMore: false,
    });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => {
      expect(screen.getByText('success')).toBeTruthy();
      expect(screen.getByText('error')).toBeTruthy();
      expect(screen.getByText('partial')).toBeTruthy();
    });
  });

  it('renders null duration as dash', async () => {
    mockApiFetch.mockResolvedValue({
      traces: [
        {
          traceId: 'tr-null',
          rootSpanName: 'x',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'success',
          spanCount: 1,
          durationMs: null,
          startedAt: '2025-01-01',
          endedAt: null,
        },
      ],
      total: 1,
      page: 1,
      perPage: 200,
      hasMore: false,
    });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => {
      expect(screen.getByText('tr-null')).toBeTruthy();
    });
    // formatDurationMs(null) returns '\u2014' per our mock
    expect(screen.getByText('\u2014')).toBeTruthy();
  });

  it('renders span count column', async () => {
    mockApiFetch.mockResolvedValue({
      traces: [
        {
          traceId: 'tr-spans',
          rootSpanName: 'chat',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'success',
          spanCount: 42,
          durationMs: 500,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
      ],
      total: 1,
      page: 1,
      perPage: 200,
      hasMore: false,
    });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue({
      traces: [
        {
          traceId: 'tr-hdr',
          rootSpanName: 'a',
          rootSpanType: 'llm',
          rootEntityType: null,
          rootEntityName: null,
          threadId: null,
          serviceName: 'api',
          status: 'success',
          spanCount: 1,
          durationMs: 100,
          startedAt: '2025-01-01',
          endedAt: '2025-01-01',
        },
      ],
      total: 1,
      page: 1,
      perPage: 200,
      hasMore: false,
    });
    renderWithQueryClient(<TracesPage />);
    await waitFor(() => {
      expect(screen.getByText('Time')).toBeTruthy();
      expect(screen.getByText('Trace ID')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Spans')).toBeTruthy();
      expect(screen.getByText('Duration')).toBeTruthy();
    });
  });

  it('renders page header and description', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<TracesPage />);
    expect(screen.getByText('Traces')).toBeTruthy();
    expect(screen.getByText('Browse and inspect agent execution traces')).toBeTruthy();
  });
});
