import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { ExperimentCreatePage } from './experiment-create';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('ExperimentCreatePage', () => {
  it('renders form fields', () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<ExperimentCreatePage />);
    expect(screen.getByLabelText('Name (optional)')).toBeTruthy();
    expect(screen.getByText('Dataset')).toBeTruthy();
  });

  it('disables run button when no dataset selected', () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<ExperimentCreatePage />);
    const btn = screen.getByRole('button', { name: 'Run' });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('navigates back on cancel', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<ExperimentCreatePage />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/experiments' });
  });

  it('populates dataset select after data loads', async () => {
    mockApiFetch.mockResolvedValue({
      datasets: [
        { id: 'ds-1', name: 'Customer QA' },
        { id: 'ds-2', name: 'Product FAQ' },
      ],
    });
    renderWithQueryClient(<ExperimentCreatePage />);
    await waitFor(() => expect(screen.getByText('Select a dataset')).toBeTruthy());
  });

  it('renders page breadcrumb with link to experiments', () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<ExperimentCreatePage />);
    const link = screen.getByText('Experiments').closest('a');
    expect(link?.getAttribute('href')).toBe('/experiments');
  });

  it('renders section heading', () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<ExperimentCreatePage />);
    expect(screen.getByText('Configuration')).toBeTruthy();
  });

  it('shows name input as optional with placeholder', () => {
    mockApiFetch.mockResolvedValue({ datasets: [] });
    renderWithQueryClient(<ExperimentCreatePage />);
    const input = screen.getByLabelText('Name (optional)') as HTMLInputElement;
    expect(input.placeholder).toBe('e.g. Baseline v2');
  });

  it('submits mutation and navigates on success', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockApiFetch.mockResolvedValue({
      datasets: [{ id: 'ds-1', name: 'Test Dataset' }],
    });
    renderWithQueryClient(<ExperimentCreatePage />);
    await waitFor(() => expect(screen.getByText('Select a dataset')).toBeTruthy());

    // Open the select dropdown and pick a dataset
    await user.click(screen.getByText('Select a dataset'));
    await waitFor(() => expect(screen.getByText('Test Dataset')).toBeTruthy());
    await user.click(screen.getByText('Test Dataset'));

    // Mock the POST response
    mockApiFetch.mockResolvedValueOnce({ id: 'exp-new-1' });

    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/experiments',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('ds-1'),
        }),
      );
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/experiments/$experimentId',
        params: { experimentId: 'exp-new-1' },
      });
    });
  });

  it('shows Starting... while mutation is pending', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockApiFetch.mockResolvedValue({
      datasets: [{ id: 'ds-1', name: 'Test Dataset' }],
    });
    renderWithQueryClient(<ExperimentCreatePage />);
    await waitFor(() => expect(screen.getByText('Select a dataset')).toBeTruthy());

    // Select a dataset
    await user.click(screen.getByText('Select a dataset'));
    await waitFor(() => expect(screen.getByText('Test Dataset')).toBeTruthy());
    await user.click(screen.getByText('Test Dataset'));

    // Mock POST to never resolve
    mockApiFetch.mockReturnValueOnce(new Promise(() => {}));

    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByText('Starting...')).toBeTruthy();
    });
  });
});
