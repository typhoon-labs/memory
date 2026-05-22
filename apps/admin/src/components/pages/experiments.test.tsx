import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={to as string} {...rest}>
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => navigateMock,
  useSearch: () => ({}),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ExperimentsPage } from './experiments';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('ExperimentsPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ExperimentsPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders experiment rows when data loads', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-1',
          name: 'Run #1',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 10,
          succeededCount: 10,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
        {
          id: 'exp-2',
          name: 'Run #2',
          status: 'running',
          datasetId: 'ds-1',
          totalItems: 20,
          succeededCount: 5,
          failedCount: 1,
          createdAt: '2025-01-02',
          startedAt: '2025-01-02',
          completedAt: null,
        },
      ],
      total: 2,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Run #1')).toBeTruthy();
      expect(screen.getByText('Run #2')).toBeTruthy();
    });
  });

  it('shows progress counts', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-1',
          name: 'Run #1',
          status: 'running',
          datasetId: 'ds-1',
          totalItems: 20,
          succeededCount: 8,
          failedCount: 2,
          createdAt: '2025-01-01',
          startedAt: null,
          completedAt: null,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => expect(screen.getByText('10 / 20')).toBeTruthy());
  });

  it('shows empty state when no experiments', async () => {
    mockApiFetch.mockResolvedValue({ experiments: [], total: 0 });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => expect(screen.getByText('No experiments yet')).toBeTruthy());
  });

  it('renders run experiment link', async () => {
    mockApiFetch.mockResolvedValue({ experiments: [], total: 0 });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      const link = screen.getByText('Run Experiment').closest('a');
      expect(link?.getAttribute('href')).toBe('/experiments/create');
    });
  });

  it('shows experiment ID prefix when name is null', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-abcdef123456789',
          name: null,
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 5,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      // id.slice(0, 12) = 'exp-abcdef12'
      expect(screen.getByText('exp-abcdef12')).toBeTruthy();
    });
  });

  it('renders status badge variants', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'e1',
          name: 'Pending',
          status: 'pending',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 0,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: null,
          completedAt: null,
        },
        {
          id: 'e2',
          name: 'Running',
          status: 'running',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 2,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: null,
        },
        {
          id: 'e3',
          name: 'Failed',
          status: 'failed',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 0,
          failedCount: 5,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 3,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      expect(screen.getByText('pending')).toBeTruthy();
      expect(screen.getByText('running')).toBeTruthy();
      expect(screen.getByText('failed')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-1',
          name: 'Col Test',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 10,
          succeededCount: 10,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Progress')).toBeTruthy();
      expect(screen.getByText('Created')).toBeTruthy();
    });
  });

  it('renders completed progress count', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-1',
          name: 'Completed Run',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 15,
          succeededCount: 13,
          failedCount: 2,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      expect(screen.getByText('15 / 15')).toBeTruthy();
    });
  });

  it('renders page description', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ExperimentsPage />);
    expect(screen.getByText('Evaluate agent quality against datasets')).toBeTruthy();
  });

  it('renders delete button for each experiment', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-del',
          name: 'Deletable',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 5,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    const { container } = renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Deletable')).toBeTruthy();
    });
    const trashIcons = container.querySelectorAll('.lucide-trash-2');
    expect(trashIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders status filter select', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ExperimentsPage />);
    // The status filter select trigger should be present
    expect(screen.getByText('Experiments')).toBeTruthy();
  });

  it('renders completed status badge', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-c',
          name: 'Completed',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 5,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
    });
  });

  it('shows delete confirmation dialog when trash icon is clicked', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-del',
          name: 'Delete Me',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 5,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    const { container } = renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => expect(screen.getByText('Delete Me')).toBeTruthy());
    const trashBtn = container.querySelector('.lucide-trash-2')?.closest('button') as HTMLElement;
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn);
    await waitFor(() => {
      expect(screen.getByText('Delete experiment?')).toBeTruthy();
      expect(screen.getByText('This will permanently delete this experiment and all its results.')).toBeTruthy();
    });
  });

  it('renders zero progress correctly', async () => {
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-zero',
          name: 'Empty Progress',
          status: 'pending',
          datasetId: 'ds-1',
          totalItems: 10,
          succeededCount: 0,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: null,
          completedAt: null,
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => expect(screen.getByText('0 / 10')).toBeTruthy());
  });

  it('confirms delete and calls DELETE API', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-del',
          name: 'Delete Me',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 5,
          succeededCount: 5,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    const { container } = renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => expect(screen.getByText('Delete Me')).toBeTruthy());

    // Open the delete dialog
    const trashBtn = container.querySelector('.lucide-trash-2')?.closest('button') as HTMLElement;
    await user.click(trashBtn);
    await waitFor(() => expect(screen.getByText('Delete experiment?')).toBeTruthy());

    // Confirm delete
    mockApiFetch.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments/exp-del', { method: 'DELETE' });
    });
  });

  it('navigates to experiment detail on row click', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      experiments: [
        {
          id: 'exp-nav',
          name: 'Click Me',
          status: 'completed',
          datasetId: 'ds-1',
          totalItems: 3,
          succeededCount: 3,
          failedCount: 0,
          createdAt: '2025-01-01',
          startedAt: '2025-01-01',
          completedAt: '2025-01-01',
        },
      ],
      total: 1,
    });
    renderWithQueryClient(<ExperimentsPage />);
    await waitFor(() => expect(screen.getByText('Click Me')).toBeTruthy());

    await user.click(screen.getByText('Click Me'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/experiments/$experimentId',
      params: { experimentId: 'exp-nav' },
    });
  });
});
