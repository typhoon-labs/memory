import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { renderWithQueryClient } from '../../../test-utils';
import { CreateFolderDialog } from './create-folder-dialog';

beforeEach(() => vi.clearAllMocks());

describe('CreateFolderDialog', () => {
  it('renders dialog form when open', () => {
    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Create Folder')).toBeTruthy();
    expect(screen.getByLabelText('Folder name')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. policies')).toBeTruthy();
  });

  it('renders cancel and create buttons', () => {
    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Cancel/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Create/ })).toBeTruthy();
  });

  it('create button is disabled when folder name is empty', () => {
    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    const createBtn = screen.getByRole('button', { name: /^Create$/ });
    expect((createBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows current path hint when currentPath is set', () => {
    renderWithQueryClient(
      <CreateFolderDialog sourceId="st-1" currentPath="docs/policies/" open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText(/Will be created in: docs\/policies\//)).toBeTruthy();
  });

  it('does not show current path hint when currentPath is empty', () => {
    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/Will be created in/)).toBeNull();
  });

  it('enables create button after entering folder name', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    const createBtn = screen.getByRole('button', { name: /^Create$/ });
    expect((createBtn as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByLabelText('Folder name');
    await user.type(input, 'my-folder');

    // After typing, the create button should be enabled
    expect((createBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls apiFetch with POST when create is submitted', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { apiFetch: apiFetchMock } = await import('@typhoon/ui');
    vi.mocked(apiFetchMock).mockResolvedValue({});

    renderWithQueryClient(
      <CreateFolderDialog sourceId="st-1" currentPath="docs/" open={true} onOpenChange={vi.fn()} />,
    );

    const input = screen.getByLabelText('Folder name');
    await user.type(input, 'subfolder');

    const createBtn = screen.getByRole('button', { name: /^Create$/ });
    await user.click(createBtn);

    await waitFor(() => {
      expect(vi.mocked(apiFetchMock)).toHaveBeenCalledWith(
        '/api/v1/sync-targets/st-1/folders',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('does not render dialog content when closed', () => {
    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Create Folder')).toBeNull();
  });

  it('submits folder on Enter key press', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { apiFetch: apiFetchMock } = await import('@typhoon/ui');
    vi.mocked(apiFetchMock).mockResolvedValue({});

    renderWithQueryClient(
      <CreateFolderDialog sourceId="st-1" currentPath="root/" open={true} onOpenChange={vi.fn()} />,
    );

    const input = screen.getByLabelText('Folder name');
    await user.type(input, 'enter-folder{Enter}');

    await waitFor(() => {
      expect(vi.mocked(apiFetchMock)).toHaveBeenCalledWith(
        '/api/v1/sync-targets/st-1/folders',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ path: 'root/enter-folder/' }),
        }),
      );
    });
  });

  it('shows Creating... text while mutation is pending', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { apiFetch: apiFetchMock } = await import('@typhoon/ui');
    vi.mocked(apiFetchMock).mockReturnValue(new Promise(() => {}));

    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByLabelText('Folder name');
    await user.type(input, 'slow-folder');
    await user.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeTruthy();
    });
  });

  it('shows error message when mutation fails', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { apiFetch: apiFetchMock } = await import('@typhoon/ui');
    vi.mocked(apiFetchMock).mockRejectedValue(new Error('Folder already exists'));

    renderWithQueryClient(<CreateFolderDialog sourceId="st-1" currentPath="" open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByLabelText('Folder name');
    await user.type(input, 'duplicate-folder');
    await user.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => {
      expect(screen.getByText('Folder already exists')).toBeTruthy();
    });
  });
});
