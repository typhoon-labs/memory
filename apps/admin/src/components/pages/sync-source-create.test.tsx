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
import { SyncSourceCreatePage } from './sync-source-create';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('SyncSourceCreatePage', () => {
  it('renders form fields', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<SyncSourceCreatePage />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
  });

  it('disables create button when form is incomplete', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<SyncSourceCreatePage />);
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('navigates back on cancel', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<SyncSourceCreatePage />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenCalledWith({ to: '/sources' });
  });

  it('populates source select after query loads', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'my-s3-source', sourceType: 's3', config: { bucket: 'docs' } },
      { name: 'web-crawler', sourceType: 'web', config: {} },
    ]);
    renderWithQueryClient(<SyncSourceCreatePage />);
    await waitFor(() => {
      expect(screen.getByText('Source')).toBeTruthy();
    });
  });

  it('shows S3 config fields when S3 source is selected (prefix only, no bucket)', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([{ name: 's3-source', sourceType: 's3', config: { bucket: 'my-bucket' } }]);
    renderWithQueryClient(<SyncSourceCreatePage />);

    // Wait for sources to load, then select a source
    await waitFor(() => {
      expect(screen.getByText('Source')).toBeTruthy();
    });

    // Click on the select trigger to open the dropdown
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Select the s3 source option
    await waitFor(() => {
      expect(screen.getByText('s3-source')).toBeTruthy();
    });
    await user.click(screen.getByText('s3-source'));

    // Prefix field should appear, bucket should NOT
    await waitFor(() => {
      expect(screen.getByLabelText('Prefix (optional)')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Bucket')).toBeNull();

    // Source bucket should be shown as informational text
    expect(screen.getByText('my-bucket')).toBeTruthy();
  });

  it('enables create when name and source are filled (no bucket needed)', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([{ name: 's3-source', sourceType: 's3', config: { bucket: 'b' } }]);
    renderWithQueryClient(<SyncSourceCreatePage />);

    // Fill in the name
    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'Test Source');

    // Select s3 source
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText('s3-source')).toBeTruthy());
    await user.click(screen.getByText('s3-source'));

    // Create should be enabled (no bucket required)
    await waitFor(() => {
      const createBtn = screen.getByRole('button', { name: 'Create' });
      expect(createBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('submits form with prefix only (no bucket) and navigates on success', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // First call returns sources list; subsequent calls return mutation response
    mockApiFetch
      .mockResolvedValueOnce([{ name: 's3-source', sourceType: 's3', config: { bucket: 'my-bucket' } }])
      .mockResolvedValueOnce({ id: 'new-sync-123' });
    renderWithQueryClient(<SyncSourceCreatePage />);

    // Wait for sources to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });

    // Fill name
    await user.type(screen.getByLabelText('Name'), 'My Docs');

    // Select source
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText('s3-source')).toBeTruthy());
    await user.click(screen.getByText('s3-source'));

    // Create button should be enabled (no bucket needed)
    const createBtn = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createBtn.hasAttribute('disabled')).toBe(false));

    await user.click(createBtn);

    // Assert mutation was called with prefix-only config (no bucket)
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My Docs',
          sourceType: 's3',
          source: 's3-source',
          config: { prefix: '' },
        }),
      });
    });

    // Assert navigation to the new source detail page
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sources/$sourceId',
        params: { sourceId: 'new-sync-123' },
      });
    });
  });

  it('re-enables button after mutation failure', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockApiFetch
      .mockResolvedValueOnce([{ name: 's3-source', sourceType: 's3', config: { bucket: 'b' } }])
      .mockRejectedValueOnce(new Error('Server error'));
    renderWithQueryClient(<SyncSourceCreatePage />);

    // Wait for sources to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });

    // Fill name
    await user.type(screen.getByLabelText('Name'), 'Failing Source');

    // Select source
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText('s3-source')).toBeTruthy());
    await user.click(screen.getByText('s3-source'));

    // Click create
    const createBtn = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(createBtn.hasAttribute('disabled')).toBe(false));
    await user.click(createBtn);

    // After failure, button should return to "Create" (not "Creating...")
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    });

    // Navigation should NOT have been called
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
