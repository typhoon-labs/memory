import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./shared', () => ({
  formatSeconds: vi.fn((s: number) => `${s}s`),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { OverviewTab } from './overview-tab';
import type { QueueSummary } from './shared';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

function makeQueue(overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    name: 'ingestion',
    isPaused: false,
    counts: {
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 3,
      delayed: 1,
      paused: 0,
      prioritized: 0,
      'waiting-children': 0,
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('OverviewTab', () => {
  it('renders stat cards with job counts', async () => {
    mockApiFetch.mockResolvedValue([]);
    const queue = makeQueue();
    renderWithQueryClient(<OverviewTab queue={queue} />);

    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Delayed')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows "No workers connected." when no workers', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);
    await waitFor(() => {
      expect(screen.getByText('No workers connected.')).toBeTruthy();
    });
  });

  it('renders workers table when workers exist', async () => {
    mockApiFetch.mockResolvedValue([
      { addr: '10.0.0.1:6379', name: 'worker-1', age: 3600, idle: 10 },
      { addr: '10.0.0.2:6379', name: 'worker-2', age: 7200, idle: 5 },
    ]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);
    await waitFor(() => {
      expect(screen.getByText('10.0.0.1:6379')).toBeTruthy();
      expect(screen.getByText('worker-1')).toBeTruthy();
      expect(screen.getByText('10.0.0.2:6379')).toBeTruthy();
      expect(screen.getByText('worker-2')).toBeTruthy();
    });
    // Column headers
    expect(screen.getByText('Address')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Uptime')).toBeTruthy();
    expect(screen.getByText('Idle')).toBeTruthy();
  });

  it('renders workers count in section label', async () => {
    mockApiFetch.mockResolvedValue([{ addr: '10.0.0.1:6379', name: 'worker-1', age: 3600, idle: 10 }]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);
    await waitFor(() => {
      expect(screen.getByText('Workers (1)')).toBeTruthy();
    });
  });

  it('renders Maintenance section with clean buttons', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);
    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Clean Completed (100)')).toBeTruthy();
    expect(screen.getByText('Clean Failed (3)')).toBeTruthy();
  });

  it('disables Clean Completed when completed count is 0', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(
      <OverviewTab
        queue={makeQueue({
          counts: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 5,
            delayed: 0,
            paused: 0,
            prioritized: 0,
            'waiting-children': 0,
          },
        })}
      />,
    );
    const btn = screen.getByRole('button', { name: /Clean Completed/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables Clean Failed when failed count is 0', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(
      <OverviewTab
        queue={makeQueue({
          counts: {
            waiting: 0,
            active: 0,
            completed: 5,
            failed: 0,
            delayed: 0,
            paused: 0,
            prioritized: 0,
            'waiting-children': 0,
          },
        })}
      />,
    );
    const btn = screen.getByRole('button', { name: /Clean Failed/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows Workers (0) when no workers data yet', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);
    expect(screen.getByText('Workers (0)')).toBeTruthy();
  });

  it('renders formatted uptime and idle for workers', async () => {
    mockApiFetch.mockResolvedValue([{ addr: '10.0.0.1:6379', name: 'w1', age: 120, idle: 30 }]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);
    await waitFor(() => {
      expect(screen.getByText('120s')).toBeTruthy();
      expect(screen.getByText('30s')).toBeTruthy();
    });
  });

  it('calls clean mutation when Clean Completed is confirmed', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);

    await user.click(screen.getByRole('button', { name: /Clean Completed/ }));
    // Dialog opens
    await waitFor(() => {
      expect(screen.getByText('Clean completed jobs?')).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Clean' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/queues/ingestion/clean',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('calls clean mutation when Clean Failed is confirmed', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab queue={makeQueue()} />);

    await user.click(screen.getByRole('button', { name: /Clean Failed/ }));
    await waitFor(() => {
      expect(screen.getByText('Clean failed jobs?')).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Clean' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/queues/ingestion/clean',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
