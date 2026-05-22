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
import { ScorerCreatePage } from './scorer-create';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('ScorerCreatePage', () => {
  it('renders form fields', () => {
    renderWithQueryClient(<ScorerCreatePage />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Type')).toBeTruthy();
    expect(screen.getByLabelText('Description (optional)')).toBeTruthy();
  });

  it('disables create button when name is empty', () => {
    renderWithQueryClient(<ScorerCreatePage />);
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('submits with correct data', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'sc-new' });
    renderWithQueryClient(<ScorerCreatePage />);

    await user.type(screen.getByLabelText('Name'), 'My Scorer');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('navigates back on cancel', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ScorerCreatePage />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/scorers' });
  });

  it('shows instructions textarea when custom type is selected', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ScorerCreatePage />);

    // Instructions field should not be visible for default "faithfulness" type
    expect(screen.queryByLabelText('Instructions')).toBeFalsy();

    // Open the select and pick "Custom (LLM Judge)"
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Custom (LLM Judge)'));

    // Instructions field should now appear
    expect(screen.getByLabelText('Instructions')).toBeTruthy();
  });

  it('enables create button when name has content', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ScorerCreatePage />);
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('Name'), 'test-scorer');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });
});
