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
vi.mock('./sync-source-detail/shared', () => ({
  formatConfig: vi.fn(() => 's3://bucket/prefix'),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { SyncSourcesPage } from './sync-sources';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

function mockFetchResponses(targets: unknown[], sources: unknown[] = []) {
  mockApiFetch.mockImplementation((url) => {
    if (String(url).includes('/api/v1/sources')) return Promise.resolve(sources) as never;
    return Promise.resolve(targets) as never;
  });
}

describe('SyncSourcesPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<SyncSourcesPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders source rows when data loads', async () => {
    mockFetchResponses(
      [
        {
          id: 'st-1',
          name: 'Main Docs',
          sourceType: 's3',
          config: { prefix: '' },
          source: 's3-default',
          isActive: true,
          cronSchedule: '0 */6 * * *',
          managedBy: null,
        },
      ],
      [{ name: 's3-default', sourceType: 's3', config: { bucket: 'docs' } }],
    );
    renderWithQueryClient(<SyncSourcesPage />);
    await waitFor(() => expect(screen.getByText('Main Docs')).toBeTruthy());
  });

  it('shows empty state when no sources', async () => {
    mockFetchResponses([]);
    renderWithQueryClient(<SyncSourcesPage />);
    await waitFor(() => expect(screen.getByText('No sync sources')).toBeTruthy());
  });

  it('renders add source link', async () => {
    mockFetchResponses([]);
    renderWithQueryClient(<SyncSourcesPage />);
    await waitFor(() => {
      const link = screen.getByText('Add Source').closest('a');
      expect(link?.getAttribute('href')).toBe('/sources/create');
    });
  });
});
