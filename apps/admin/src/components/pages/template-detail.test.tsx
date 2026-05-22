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
vi.mock('../shared/field-badge-popover', () => ({
  FieldBadgePopover: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock('../shared/field-schema-editor', () => ({
  FieldSchemaEditor: () => <div data-testid="field-editor">Editor</div>,
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { MetadataTemplateDetailPage as TemplateDetailPage } from './template-detail';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = {};
});

describe('TemplateDetailPage — create mode', () => {
  it('renders create form', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  it('does not show delete button in create mode', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    expect(screen.queryByText('Delete')).toBeFalsy();
  });

  it('renders field groups section', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    expect(screen.getByText('Field Groups')).toBeTruthy();
    expect(screen.getByText('Include fields from existing groups.')).toBeTruthy();
  });

  it('renders custom fields section with field editor', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    expect(screen.getByText('Custom Fields')).toBeTruthy();
    expect(screen.getByTestId('field-editor')).toBeTruthy();
  });

  it('renders Cancel button', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('disables Create button when name is empty', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toHaveProperty('disabled', true);
  });

  it('shows no groups message when no field groups exist', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No field groups exist yet. Create one first.')).toBeTruthy();
    });
  });

  it('renders group checkboxes when field groups exist', async () => {
    mockApiFetch.mockResolvedValue([
      { id: 'fg-1', name: 'Region', description: 'Geographic fields', fields: { country: { type: 'string' } } },
      { id: 'fg-2', name: 'Product', description: null, fields: { sku: { type: 'string' } } },
    ]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Region')).toBeTruthy();
      expect(screen.getByText('Product')).toBeTruthy();
      expect(screen.getByText('Geographic fields')).toBeTruthy();
    });
  });

  it('renders breadcrumb with Create label', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);
    expect(screen.getByText('Templates')).toBeTruthy();
    // "Create" appears in both breadcrumb and button
    expect(screen.getAllByText('Create').length).toBeGreaterThanOrEqual(2);
  });
});

describe('TemplateDetailPage — create mutation', () => {
  it('calls apiFetch with POST when creating', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    // First call: field groups query, subsequent calls: create mutation
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'POST') return Promise.resolve({ id: 'tmpl-new' });
      return Promise.resolve([]); // field groups query
    });
    renderWithQueryClient(<TemplateDetailPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeTruthy();
    });

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'New Template');

    const createBtn = screen.getByRole('button', { name: 'Create' });
    await user.click(createBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-templates',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('navigates back on cancel click', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<TemplateDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(navigateMock).toHaveBeenCalledWith({ to: '/metadata/templates' });
  });

  it('toggles group checkbox selection', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([
      { id: 'fg-1', name: 'Region', description: null, fields: { country: { type: 'string' } } },
    ]);
    renderWithQueryClient(<TemplateDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Region')).toBeTruthy();
    });

    // Click on the checkbox label to toggle it
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    // Checkbox should now be checked
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });
});

describe('TemplateDetailPage — hasChanges + banner', () => {
  beforeEach(() => {
    mockParams = { templateId: 'tmpl-1' };
  });

  it('Save button is disabled when no changes have been made', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Standard')).toBeTruthy();
    });
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toHaveProperty('disabled', true);
  });

  it('Save button is enabled after making a change', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Standard')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Standard');
    await user.clear(nameInput);
    await user.type(nameInput, 'Standard Updated');

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toHaveProperty('disabled', false);
  });

  it('shows amber banner after successful save when syncTargetCount > 0', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ id: 'tmpl-1', name: 'Updated', syncTargetCount: 2 });
      if (url.includes('/metadata-templates/tmpl-1'))
        return Promise.resolve({
          id: 'tmpl-1',
          name: 'Standard',
          description: null,
          fieldGroupIds: [],
          customFields: {},
        });
      return Promise.resolve([]); // field groups
    });
    renderWithQueryClient(<TemplateDetailPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Standard')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Standard');
    await user.clear(nameInput);
    await user.type(nameInput, 'Standard Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/2 sync source\(s\) affected/)).toBeTruthy();
    });
  });
});

describe('TemplateDetailPage — edit mode', () => {
  beforeEach(() => {
    mockParams = { templateId: 'tmpl-1' };
  });

  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<TemplateDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders template data after loading', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: 'Default template',
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Standard')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });
  });

  it('renders delete button in edit mode', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeTruthy();
    });
  });

  it('renders field editor in edit mode', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByTestId('field-editor')).toBeTruthy();
    });
  });

  it('renders group checkboxes in edit mode with groups', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: ['fg-1'],
        customFields: {},
      })
      .mockResolvedValueOnce([
        { id: 'fg-1', name: 'Region', description: 'Geo', fields: { country: { type: 'string' } } },
        { id: 'fg-2', name: 'Product', description: null, fields: { sku: { type: 'string' } } },
      ]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Region')).toBeTruthy();
      expect(screen.getByText('Product')).toBeTruthy();
    });
  });

  it('populates description field', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: 'Default metadata template',
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Default metadata template')).toBeTruthy();
    });
  });

  it('renders breadcrumb with template name', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Templates')).toBeTruthy();
      expect(screen.getByText('Standard')).toBeTruthy();
    });
  });

  it('calls apiFetch with PATCH when saving in edit mode', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ id: 'tmpl-1', name: 'Updated' });
      if (url.includes('/metadata-templates/tmpl-1'))
        return Promise.resolve({
          id: 'tmpl-1',
          name: 'Standard',
          description: null,
          fieldGroupIds: [],
          customFields: {},
        });
      return Promise.resolve([]); // field groups
    });
    renderWithQueryClient(<TemplateDetailPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Standard')).toBeTruthy();
    });

    // Make a change so Save button is enabled
    const nameInput = screen.getByDisplayValue('Standard');
    await user.clear(nameInput);
    await user.type(nameInput, 'Standard Updated');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-templates/tmpl-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  it('renders Cancel button in edit mode', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: [],
        customFields: {},
      })
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });
  });

  it('renders group checkbox with field badges in edit mode', async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        id: 'tmpl-1',
        name: 'Standard',
        description: null,
        fieldGroupIds: ['fg-1'],
        customFields: {},
      })
      .mockResolvedValueOnce([
        {
          id: 'fg-1',
          name: 'Region',
          description: 'Geo',
          fields: { country: { type: 'string' }, state: { type: 'string' } },
        },
      ]);
    renderWithQueryClient(<TemplateDetailPage />);
    await waitFor(() => {
      // Group checkbox should be checked since fg-1 is in fieldGroupIds
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox.getAttribute('aria-checked')).toBe('true');
      // Field badges should render (FieldBadgePopover mocked to show name)
      expect(screen.getByText('country')).toBeTruthy();
      expect(screen.getByText('state')).toBeTruthy();
    });
  });

  it('opens delete confirmation dialog and triggers deletion', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'DELETE') return Promise.resolve({});
      if (url.includes('/metadata-templates/tmpl-1'))
        return Promise.resolve({
          id: 'tmpl-1',
          name: 'Standard',
          description: null,
          fieldGroupIds: [],
          customFields: {},
        });
      return Promise.resolve([]); // field groups
    });
    renderWithQueryClient(<TemplateDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeTruthy();
    });

    await user.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete template?')).toBeTruthy();
    });

    // Click the confirm Delete button inside the dialog
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    const confirmBtn = deleteButtons.at(-1);
    expect(confirmBtn).toBeTruthy();
    if (confirmBtn) await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/metadata-templates/tmpl-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
