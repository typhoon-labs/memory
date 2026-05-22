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
import { DatasetCreatePage } from './dataset-create';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('DatasetCreatePage', () => {
  it('renders form fields', () => {
    renderWithQueryClient(<DatasetCreatePage />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Description (optional)')).toBeTruthy();
  });

  it('disables create button when name is empty', () => {
    renderWithQueryClient(<DatasetCreatePage />);
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('submits form with correct data', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'ds-new' });
    renderWithQueryClient(<DatasetCreatePage />);

    await user.type(screen.getByLabelText('Name'), 'My Dataset');
    await user.type(screen.getByLabelText('Description (optional)'), 'Test desc');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Dataset', description: 'Test desc' }),
      });
    });
  });

  it('navigates back on cancel', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<DatasetCreatePage />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/datasets' });
  });
});
