import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('./queue-detail/shared', () => ({}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { QueuesPage } from './queues';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('QueuesPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<QueuesPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders queue rows when data loads', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 2, waiting: 5, completed: 100, failed: 1, delayed: 0 } },
      { name: 'scoring', isPaused: true, counts: { active: 0, waiting: 0, completed: 50, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => {
      expect(screen.getByText('ingestion')).toBeTruthy();
      expect(screen.getByText('scoring')).toBeTruthy();
    });
  });

  it('shows empty state when no queues', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => expect(screen.getByText('No queues')).toBeTruthy());
  });

  it('shows status badges for paused and active queues', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
      { name: 'scoring', isPaused: true, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => {
      // "Active" appears in both the column header and status badge
      const activeBadges = screen.getAllByText('Active');
      expect(activeBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Paused')).toBeTruthy();
    });
  });

  it('highlights failed count in red when greater than zero', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 1, waiting: 3, completed: 50, failed: 5, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => {
      expect(screen.getByText('ingestion')).toBeTruthy();
    });
    // The failed count cell with value > 0 should have 'text-red-400' class
    const failedCell = screen.getByText('5');
    expect(failedCell.className).toContain('text-red-400');
  });

  it('renders all count columns correctly', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'jobs', isPaused: false, counts: { active: 2, waiting: 10, completed: 100, failed: 0, delayed: 3 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => {
      expect(screen.getByText('10')).toBeTruthy(); // waiting
      expect(screen.getByText('2')).toBeTruthy(); // active
      expect(screen.getByText('100')).toBeTruthy(); // completed
      expect(screen.getByText('0')).toBeTruthy(); // failed
      expect(screen.getByText('3')).toBeTruthy(); // delayed
    });
  });

  it('does not highlight failed count when it is zero', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'clean-queue', isPaused: false, counts: { active: 0, waiting: 0, completed: 10, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => {
      expect(screen.getByText('clean-queue')).toBeTruthy();
    });
    // All zeros — find the failed column cell (which is also 0)
    // The failed=0 cell should NOT have red styling
    const zeroCells = screen.getAllByText('0');
    const tabularCells = zeroCells.filter((cell) => cell.className.includes('tabular-nums'));
    expect(tabularCells.length).toBeGreaterThan(0);
    for (const cell of tabularCells) {
      expect(cell.className).not.toContain('text-red-400');
    }
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'q', isPaused: false, counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => {
      expect(screen.getByText('Queue')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Waiting')).toBeTruthy();
      expect(screen.getByText('Failed')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
      expect(screen.getByText('Delayed')).toBeTruthy();
    });
  });

  it('renders page header and description', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<QueuesPage />);
    expect(screen.getByText('Queues')).toBeTruthy();
    expect(screen.getByText('Monitor and manage background job queues')).toBeTruthy();
  });

  it('navigates to queue detail on row click', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { name: 'ingestion', isPaused: false, counts: { active: 1, waiting: 0, completed: 0, failed: 0, delayed: 0 } },
    ]);
    renderWithQueryClient(<QueuesPage />);
    await waitFor(() => expect(screen.getByText('ingestion')).toBeTruthy());

    await user.click(screen.getByText('ingestion'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/queues/$queueName',
      params: { queueName: 'ingestion' },
    });
  });
});
