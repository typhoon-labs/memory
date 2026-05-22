import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ queueName: 'ingestion' }),
  useSearch: () => ({ tab: 'overview', jobState: 'waiting' }),
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('./queue-detail/overview-tab', () => ({ OverviewTab: () => <div data-testid="overview-tab">Overview</div> }));
vi.mock('./queue-detail/jobs-tab', () => ({ JobsTab: () => <div>Jobs</div> }));
vi.mock('./queue-detail/failed-jobs-tab', () => ({ FailedJobsTab: () => <div>Failed</div> }));
vi.mock('./queue-detail/shared', () => ({ JOB_STATES: ['waiting', 'active', 'completed', 'failed'] }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { QueueDetailPage } from './queue-detail';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('QueueDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<QueueDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows queue not found when queue missing', async () => {
    mockApiFetch.mockResolvedValue([{ name: 'other', isPaused: false, counts: {} }]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => expect(screen.getByText('Queue not found.')).toBeTruthy());
  });

  it('renders queue detail with tabs', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 2, waiting: 5, completed: 100, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('ingestion')).toBeTruthy();
      // Tab triggers + mocked content both render "Overview"
      expect(screen.getAllByText('Overview').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('overview-tab')).toBeTruthy();
    });
  });

  it('shows pause button for active queue', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => expect(screen.getByText('Pause')).toBeTruthy());
  });

  it('shows resume button for paused queue', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: true, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => expect(screen.getByText('Resume')).toBeTruthy());
  });

  it('renders Active status badge for non-paused queue', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 1, waiting: 2, completed: 50, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeTruthy();
    });
  });

  it('renders Paused status badge for paused queue', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: true, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Paused')).toBeTruthy();
    });
  });

  it('renders breadcrumb link to queues list', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Queues')).toBeTruthy();
    });
  });

  it('renders all three tab triggers', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Overview').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Jobs')).toBeTruthy();
      expect(screen.getByText('Failed Archive')).toBeTruthy();
    });
  });

  it('renders overview tab content by default', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByTestId('overview-tab')).toBeTruthy();
    });
  });

  it('calls navigate when Pause button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Pause')).toBeTruthy();
    });
    // Mock apiFetch for the pause mutation
    mockApiFetch.mockResolvedValue({});
    await user.click(screen.getByText('Pause'));
    // The pause mutation should have been called
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/pause', { method: 'POST' });
    });
  });

  it('calls navigate when Resume button is clicked on paused queue', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: true, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Resume')).toBeTruthy();
    });
    mockApiFetch.mockResolvedValue({});
    await user.click(screen.getByText('Resume'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/resume', { method: 'POST' });
    });
  });

  it('calls navigate when Jobs tab is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Jobs')).toBeTruthy();
    });
    await user.click(screen.getByText('Jobs'));
    expect(navigateMock).toHaveBeenCalled();
  });

  it('calls navigate when Failed Archive tab is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Failed Archive')).toBeTruthy();
    });
    await user.click(screen.getByText('Failed Archive'));
    expect(navigateMock).toHaveBeenCalled();
  });
});
