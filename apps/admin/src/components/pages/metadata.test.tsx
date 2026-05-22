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
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('../shared/field-badge-popover', () => ({
  FieldBadgePopover: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock('../shared/field-group-badge-popover', () => ({
  FieldGroupBadgePopover: ({ group }: { group: { name: string } }) => <span>{group.name}</span>,
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { MetadataFieldGroupsPage, MetadataTemplatesPage } from './metadata';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('MetadataFieldGroupsPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<MetadataFieldGroupsPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders field group rows when data loads', async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: 'fg-1',
        name: 'Region',
        description: 'Geographic fields',
        fields: { country: { type: 'string' } },
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      },
    ]);
    renderWithQueryClient(<MetadataFieldGroupsPage />);
    await waitFor(() => expect(screen.getByText('Region')).toBeTruthy());
  });

  it('shows empty state when no groups', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<MetadataFieldGroupsPage />);
    await waitFor(() => expect(screen.getByText('No field groups yet')).toBeTruthy());
  });

  it('renders create group link', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<MetadataFieldGroupsPage />);
    await waitFor(() => {
      const link = screen.getByText('Create Group').closest('a');
      expect(link?.getAttribute('href')).toBe('/metadata/field-groups/create');
    });
  });

  it('renders column headers for field groups', async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: 'fg-1',
        name: 'TestGroup',
        description: null,
        fields: { a: { type: 'string' } },
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      },
    ]);
    renderWithQueryClient(<MetadataFieldGroupsPage />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Fields')).toBeTruthy();
      expect(screen.getByText('Count')).toBeTruthy();
    });
  });

  it('renders field count in Count column', async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: 'fg-c',
        name: 'Multi',
        description: null,
        fields: { a: { type: 'string' }, b: { type: 'number' } },
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      },
    ]);
    renderWithQueryClient(<MetadataFieldGroupsPage />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('renders field group description when present', async () => {
    mockApiFetch.mockResolvedValue([
      {
        id: 'fg-d',
        name: 'Described',
        description: 'My description',
        fields: {},
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      },
    ]);
    renderWithQueryClient(<MetadataFieldGroupsPage />);
    await waitFor(() => {
      expect(screen.getByText('My description')).toBeTruthy();
    });
  });
});

describe('MetadataTemplatesPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<MetadataTemplatesPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders template rows when data loads', async () => {
    // First call: templates, second: field groups
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'tmpl-1',
          name: 'Standard',
          description: null,
          fieldGroupIds: ['fg-1'],
          customFields: {},
          effectiveSchema: { country: { type: 'string' } },
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'fg-1',
          name: 'Region',
          description: null,
          fields: { country: { type: 'string' } },
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ]);
    renderWithQueryClient(<MetadataTemplatesPage />);
    await waitFor(() => expect(screen.getByText('Standard')).toBeTruthy());
  });

  it('shows empty state when no templates', async () => {
    mockApiFetch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    renderWithQueryClient(<MetadataTemplatesPage />);
    await waitFor(() => expect(screen.getByText('No templates yet')).toBeTruthy());
  });

  it('renders create template link', async () => {
    mockApiFetch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    renderWithQueryClient(<MetadataTemplatesPage />);
    await waitFor(() => {
      const link = screen.getByText('Create Template').closest('a');
      expect(link?.getAttribute('href')).toBe('/metadata/templates/create');
    });
  });

  it('renders template description when present', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'tmpl-d',
          name: 'Described',
          description: 'Template desc',
          fieldGroupIds: [],
          customFields: {},
          effectiveSchema: {},
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<MetadataTemplatesPage />);
    await waitFor(() => {
      expect(screen.getByText('Template desc')).toBeTruthy();
    });
  });

  it('renders dash for template with no groups and no effective fields', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'tmpl-e',
          name: 'Empty',
          description: null,
          fieldGroupIds: [],
          customFields: {},
          effectiveSchema: {},
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<MetadataTemplatesPage />);
    await waitFor(() => {
      expect(screen.getByText('Empty')).toBeTruthy();
    });
    // Groups column and Effective Fields column show dashes
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
