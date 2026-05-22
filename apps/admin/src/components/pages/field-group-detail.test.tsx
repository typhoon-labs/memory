import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
let mockParams: Record<string, string> = {};
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => mockParams,
  useNavigate: () => navigateMock,
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('../shared/field-schema-editor', () => ({
  FieldSchemaEditor: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" data-testid="field-editor" onClick={() => onChange({ country: { type: 'string' } })}>
      Editor
    </button>
  ),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { FieldGroupDetailPage } from './field-group-detail';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = {};
});

describe('FieldGroupDetailPage — create mode', () => {
  it('renders create form with empty fields', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    expect(screen.getByTestId('field-editor')).toBeTruthy();
  });

  it('does not show delete button', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    expect(screen.queryByText('Delete')).toBeFalsy();
  });

  it('renders Cancel button that navigates back', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('renders Description field', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    expect(screen.getByLabelText('Description (optional)')).toBeTruthy();
  });

  it('renders breadcrumb with Create label', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    expect(screen.getByText('Field Groups')).toBeTruthy();
    // "Create" appears in both breadcrumb and button
    expect(screen.getAllByText('Create').length).toBeGreaterThanOrEqual(2);
  });

  it('disables Create button when name is empty', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toHaveProperty('disabled', true);
  });

  it('renders Fields section heading', () => {
    renderWithQueryClient(<FieldGroupDetailPage />);
    expect(screen.getByText('Fields')).toBeTruthy();
    expect(screen.getByText('Define the metadata fields in this group.')).toBeTruthy();
  });
});

describe('FieldGroupDetailPage — create mutation', () => {
  it('calls apiFetch with POST when creating', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue({ id: 'fg-new' });
    renderWithQueryClient(<FieldGroupDetailPage />);

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'New Group');

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await user.click(createBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-field-groups',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('navigates back on cancel click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithQueryClient(<FieldGroupDetailPage />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(navigateMock).toHaveBeenCalledWith({ to: '/metadata/field-groups' });
  });
});

describe('FieldGroupDetailPage — update mutation', () => {
  it('calls apiFetch with PATCH when updating', async () => {
    mockParams = { groupId: 'fg-1' };
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: null,
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Region')).toBeTruthy();
    });

    // Make a change so Save button is enabled
    const nameInput = screen.getByDisplayValue('Region');
    await user.clear(nameInput);
    await user.type(nameInput, 'Region Updated');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-field-groups/fg-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});

describe('FieldGroupDetailPage — hasChanges + banner', () => {
  beforeEach(() => {
    mockParams = { groupId: 'fg-1' };
  });

  it('Save button is disabled when no changes have been made', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: null,
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Region')).toBeTruthy();
    });
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toHaveProperty('disabled', true);
  });

  it('Save button is enabled after making a change', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: null,
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Region')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Region');
    await user.clear(nameInput);
    await user.type(nameInput, 'Region Updated');

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toHaveProperty('disabled', false);
  });

  it('shows amber banner after successful save when affectedSyncTargetCount > 0', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ id: 'fg-1', affectedSyncTargetCount: 3 });
      return Promise.resolve({
        id: 'fg-1',
        name: 'Region',
        description: null,
        fields: { country: { type: 'string' } },
      });
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Region')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Region');
    await user.clear(nameInput);
    await user.type(nameInput, 'Region Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/3 sync source\(s\) affected/)).toBeTruthy();
    });
  });

  it('does not show amber banner when affectedSyncTargetCount is 0', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ id: 'fg-1', affectedSyncTargetCount: 0 });
      return Promise.resolve({
        id: 'fg-1',
        name: 'Region',
        description: null,
        fields: { country: { type: 'string' } },
      });
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Region')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Region');
    await user.clear(nameInput);
    await user.type(nameInput, 'Region Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      // Verify PATCH was called
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-field-groups/fg-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    expect(screen.queryByText(/sync source\(s\) affected/)).toBeFalsy();
  });
});

describe('FieldGroupDetailPage — edit mode', () => {
  beforeEach(() => {
    mockParams = { groupId: 'fg-1' };
  });

  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<FieldGroupDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders group data after loading', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: 'Geo fields',
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Region')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });
  });

  it('renders delete button in edit mode', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: 'Geo fields',
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeTruthy();
    });
  });

  it('renders Cancel button in edit mode', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: null,
      fields: {},
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });
  });

  it('renders field editor in edit mode', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: null,
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByTestId('field-editor')).toBeTruthy();
    });
  });

  it('populates description field', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: 'Geographic metadata',
      fields: {},
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Geographic metadata')).toBeTruthy();
    });
  });

  it('renders breadcrumb with group name in edit mode', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: null,
      fields: {},
    });
    renderWithQueryClient(<FieldGroupDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Field Groups')).toBeTruthy();
      expect(screen.getByText('Region')).toBeTruthy();
    });
  });

  it('opens delete confirmation dialog and triggers deletion', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue({
      id: 'fg-1',
      name: 'Region',
      description: 'Geo fields',
      fields: { country: { type: 'string' } },
    });
    renderWithQueryClient(<FieldGroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeTruthy();
    });

    // Click the Delete trigger button
    await user.click(screen.getByText('Delete'));

    // AlertDialog should show confirmation text
    await waitFor(() => {
      expect(screen.getByText('Delete field group?')).toBeTruthy();
      expect(screen.getByText(/permanently delete/)).toBeTruthy();
    });

    // Confirm deletion
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    // The confirm button inside the dialog is the last one
    const confirmBtn = confirmButtons.at(-1);
    expect(confirmBtn).toBeTruthy();
    if (confirmBtn) await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-field-groups/fg-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
