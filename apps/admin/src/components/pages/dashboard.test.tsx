import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/evals/scorer-categories', () => ({
  normalizeScoreForAvg: vi.fn((v: number) => v),
  SCORER_CATEGORIES: {},
}));
vi.mock('../charts/score-trend-chart', () => ({ ScoreTrendChart: () => <div>ScoreTrendChart</div> }));
vi.mock('../charts/latency-chart', () => ({ LatencyChart: () => <div>LatencyChart</div> }));
vi.mock('../charts/token-bar-chart', () => ({ TokenBarChart: () => <div>TokenBarChart</div> }));
vi.mock('../charts/sparkline', () => ({ Sparkline: () => <div>Sparkline</div> }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { AdminDashboard } from './dashboard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock with simplified signature
const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('AdminDashboard', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<AdminDashboard />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders page title', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<AdminDashboard />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('renders date range tabs', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<AdminDashboard />);
    expect(screen.getByText('24h')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('30 days')).toBeTruthy();
    expect(screen.getByText('90 days')).toBeTruthy();
  });

  it('renders stat cards with data', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') {
        return Promise.resolve([
          { id: 'd1', status: 'ready' },
          { id: 'd2', status: 'ready' },
          { id: 'd3', status: 'processing' },
        ]);
      }
      if (url === '/api/v1/sync-targets') {
        return Promise.resolve([{ id: 'st-1' }, { id: 'st-2' }]);
      }
      // Dashboard analytics endpoints return empty data
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Sync Sources')).toBeTruthy();
      expect(screen.getByText('Documents')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy(); // sync source count
      expect(screen.getByText('2 / 3')).toBeTruthy(); // 2 ready out of 3
    });
  });

  it('renders response and retrieval quality stat cards', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<AdminDashboard />);
    expect(screen.getByText('Response Quality')).toBeTruthy();
    expect(screen.getByText('Retrieval Quality')).toBeTruthy();
  });

  it('renders widget card titles', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Score Distributions Over Time')).toBeTruthy();
      expect(screen.getByText('Lowest Quality Threads')).toBeTruthy();
      expect(screen.getByText('Per-User Quality')).toBeTruthy();
      expect(screen.getByText('Response Latency')).toBeTruthy();
      expect(screen.getByText('Token Usage')).toBeTruthy();
    });
  });

  it('renders empty states when no data', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('No score data')).toBeTruthy();
      expect(screen.getByText('No scored threads')).toBeTruthy();
      expect(screen.getByText('No user data')).toBeTruthy();
      expect(screen.getByText('No latency data')).toBeTruthy();
      expect(screen.getByText('No token data')).toBeTruthy();
    });
  });

  it('renders thread data table when threads are available', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/threads')) {
        return Promise.resolve({
          threads: [
            {
              threadId: 't-1',
              title: 'Low quality thread',
              resourceId: 'u-1',
              responseAvg: 0.32,
              retrievalAvg: 0.45,
              scoreCount: 5,
              createdAt: '2025-01-01',
            },
          ],
        });
      }
      if (url.includes('dashboard/users')) {
        return Promise.resolve({
          users: [
            {
              resourceId: 'u-1',
              email: 'test@typhoon.local',
              responseAvg: 0.65,
              retrievalAvg: 0.72,
              scoreCount: 10,
              threadCount: 3,
            },
          ],
        });
      }
      return Promise.resolve({ series: [], buckets: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Low quality thread')).toBeTruthy();
      expect(screen.getByText('test@typhoon.local')).toBeTruthy();
    });
  });

  it('renders stat card numbers for documents and sync sources', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') {
        return Promise.resolve([
          { id: 'd1', status: 'ready' },
          { id: 'd2', status: 'ready' },
          { id: 'd3', status: 'ready' },
          { id: 'd4', status: 'error' },
        ]);
      }
      if (url === '/api/v1/sync-targets') {
        return Promise.resolve([{ id: 'st-1' }, { id: 'st-2' }, { id: 'st-3' }]);
      }
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeTruthy(); // 3 sync sources
      expect(screen.getByText('3 / 4')).toBeTruthy(); // 3 ready out of 4
    });
  });

  it('renders page description', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<AdminDashboard />);
    expect(screen.getByText('System overview and response quality analytics')).toBeTruthy();
  });

  it('renders thread title column with thread ID fallback', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/threads')) {
        return Promise.resolve({
          threads: [
            {
              threadId: 'abcdefghijkl1234',
              title: '',
              resourceId: 'u-1',
              responseAvg: 0.3,
              retrievalAvg: null,
              scoreCount: 2,
              createdAt: '2025-01-01',
            },
          ],
        });
      }
      return Promise.resolve({ series: [], buckets: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      // Empty title should fall back to threadId slice
      expect(screen.getByText('abcdefghijkl')).toBeTruthy();
    });
  });

  it('renders user email column with resource ID fallback', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/users')) {
        return Promise.resolve({
          users: [
            {
              resourceId: 'user-longid-123456',
              email: null,
              responseAvg: 0.5,
              retrievalAvg: 0.6,
              scoreCount: 3,
              threadCount: 1,
            },
          ],
        });
      }
      return Promise.resolve({ series: [], buckets: [], threads: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      // null email falls back to resourceId.slice(0, 12)
      expect(screen.getByText('user-longid-')).toBeTruthy();
    });
  });

  it('renders thread response and retrieval avg as dash when null', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/threads')) {
        return Promise.resolve({
          threads: [
            {
              threadId: 't-null',
              title: 'Null Scores Thread',
              resourceId: 'u-1',
              responseAvg: null,
              retrievalAvg: null,
              scoreCount: 0,
              createdAt: '2025-01-01',
            },
          ],
        });
      }
      return Promise.resolve({ series: [], buckets: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Null Scores Thread')).toBeTruthy();
    });
    // Null avgs render as dashes
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders user thread and score counts', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/users')) {
        return Promise.resolve({
          users: [
            {
              resourceId: 'u-1',
              email: 'admin@test.com',
              responseAvg: 0.8,
              retrievalAvg: 0.7,
              scoreCount: 15,
              threadCount: 5,
            },
          ],
        });
      }
      return Promise.resolve({ series: [], buckets: [], threads: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeTruthy();
      expect(screen.getByText('15')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
    });
  });

  it('renders score trend chart when score data exists', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/scores')) {
        return Promise.resolve({
          series: [{ date: '2025-01-01', scorerId: 'accuracy', avgScore: 0.8, count: 5, failCount: 0 }],
          buckets: ['2025-01-01'],
        });
      }
      return Promise.resolve({ threads: [], users: [], series: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('ScoreTrendChart')).toBeTruthy();
    });
  });

  it('renders latency chart when latency data exists', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/latency')) {
        return Promise.resolve({
          series: [{ date: '2025-01-01', p50: 200, p95: 500, p99: 800, count: 10 }],
        });
      }
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('LatencyChart')).toBeTruthy();
    });
  });

  it('renders token bar chart when cost data exists', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      if (url.includes('dashboard/cost')) {
        return Promise.resolve({
          series: [{ date: '2025-01-01', promptTokens: 1000, completionTokens: 500, callCount: 5 }],
        });
      }
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('TokenBarChart')).toBeTruthy();
    });
  });

  it('renders dash for documents stat card when no documents', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/v1/documents') return Promise.resolve([]);
      if (url === '/api/v1/sync-targets') return Promise.resolve([]);
      return Promise.resolve({ series: [], buckets: [], threads: [], users: [] });
    });
    renderWithQueryClient(<AdminDashboard />);
    await waitFor(() => {
      expect(screen.getByText('Documents')).toBeTruthy();
    });
    // When docTotal is 0, the value should be a dash
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });
});
