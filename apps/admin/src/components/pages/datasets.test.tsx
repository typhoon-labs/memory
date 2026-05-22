import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={to as string} {...rest}>
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { DatasetsPage } from './datasets';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('DatasetsPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<DatasetsPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders dataset rows when data loads', async () => {
    mockApiFetch.mockResolvedValue({
      datasets: [
        {
          id: 'ds-1',
          name: 'Customer QA',
          description: null,
          version: 1,
          itemCount: 5,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        {
          id: 'ds-2',
          name: 'Product FAQ',
          description: 'FAQ set',
          version: 1,
          itemCount: 3,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });
    renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => {
      expect(screen.getByText('Customer QA')).toBeTruthy();
      expect(screen.getByText('Product FAQ')).toBeTruthy();
    });
  });

  it('shows empty state when no datasets', async () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => expect(screen.getByText('No datasets yet')).toBeTruthy());
  });

  it('renders create button linking to create page', async () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => {
      const link = screen.getByText('Create Dataset').closest('a');
      expect(link?.getAttribute('href')).toBe('/datasets/create');
    });
  });

  it('renders description column with text or dash', async () => {
    mockApiFetch.mockResolvedValue({
      datasets: [
        {
          id: 'ds-1',
          name: 'With Desc',
          description: 'A useful set',
          version: 1,
          itemCount: 5,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        {
          id: 'ds-2',
          name: 'No Desc',
          description: null,
          version: 1,
          itemCount: 3,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });
    renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => {
      expect(screen.getByText('A useful set')).toBeTruthy();
      expect(screen.getByText('\u2014')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue({
      datasets: [
        {
          id: 'ds-1',
          name: 'Test',
          description: null,
          version: 1,
          itemCount: 1,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });
    renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Description')).toBeTruthy();
      expect(screen.getByText('Created')).toBeTruthy();
    });
  });

  it('renders delete button for each dataset', async () => {
    mockApiFetch.mockResolvedValue({
      datasets: [
        {
          id: 'ds-del',
          name: 'Deletable',
          description: null,
          version: 1,
          itemCount: 1,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });
    const { container } = renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => {
      expect(screen.getByText('Deletable')).toBeTruthy();
    });
    const trashIcons = container.querySelectorAll('.lucide-trash-2');
    expect(trashIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('opens delete dialog and calls DELETE API when confirmed', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      datasets: [
        {
          id: 'ds-del',
          name: 'Deletable Dataset',
          description: null,
          version: 1,
          itemCount: 1,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });
    const { container } = renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => expect(screen.getByText('Deletable Dataset')).toBeTruthy());

    // Click the trash icon to open the delete dialog
    const trashBtn = container.querySelector('.lucide-trash-2')?.closest('button');
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn!);

    // AlertDialog should appear
    await waitFor(() => expect(screen.getByText('Delete dataset?')).toBeTruthy());
    expect(screen.getAllByText(/Deletable Dataset/).length).toBeGreaterThanOrEqual(1);

    // Confirm delete
    mockApiFetch.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-del', { method: 'DELETE' });
    });
  });

  it('navigates to dataset detail on row click', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      datasets: [
        {
          id: 'ds-nav',
          name: 'Navigate Me',
          description: null,
          version: 1,
          itemCount: 2,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ],
    });
    renderWithQueryClient(<DatasetsPage />);
    await waitFor(() => expect(screen.getByText('Navigate Me')).toBeTruthy());

    await user.click(screen.getByText('Navigate Me'));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/datasets/$datasetId',
      params: { datasetId: 'ds-nav' },
    });
  });
});
