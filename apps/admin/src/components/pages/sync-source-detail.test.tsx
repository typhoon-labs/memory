import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSearch = vi.fn(() => ({ tab: 'documents', path: '' }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useParams: () => ({ sourceId: 'st-1' }),
  useSearch: () => mockUseSearch(),
  useNavigate: () => vi.fn(),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn(), detailTitle: vi.fn() }));
vi.mock('./sync-source-detail/overview-tab', () => ({
  OverviewTab: () => <div data-testid="overview-tab">Overview</div>,
}));
vi.mock('./sync-source-detail/documents-tab', () => ({
  DocumentsTab: () => <div>Documents</div>,
}));
vi.mock('./sync-source-detail/sync-log-tab', () => ({ SyncLogTab: () => <div>Sync Log</div> }));
vi.mock('./sync-source-detail/shared', () => ({
  formatConfig: vi.fn(() => 's3://bucket'),
  formatCron: vi.fn(() => 'Every 6h'),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { SyncSourceDetailPage } from './sync-source-detail';

const mockApiFetch = vi.mocked(apiFetch);

function mockActiveSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st-1',
    name: 'Main Docs',
    sourceType: 's3',
    config: { prefix: '' },
    source: 's3-default',
    isActive: true,
    cronSchedule: '0 */6 * * *',
    ...overrides,
  };
}

const mockSourcesList = [{ name: 's3-default', sourceType: 's3', config: { bucket: 'docs' } }];

/** Set up mockApiFetch to return target, jobs, and sources based on URL. */
function setupFetch(target: unknown, jobs: unknown[] = []) {
  mockApiFetch.mockImplementation(((url: string) => {
    if (url.includes('/api/v1/sources')) return Promise.resolve(mockSourcesList);
    if (url.includes('/jobs')) return Promise.resolve(jobs);
    if (url.includes('/sync-targets/')) return Promise.resolve(target);
    return Promise.resolve([]);
  }) as typeof apiFetch);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSearch.mockReturnValue({ tab: 'documents', path: '' });
});

describe('SyncSourceDetailPage', () => {
  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<SyncSourceDetailPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows not found when target missing', async () => {
    setupFetch(null);
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => expect(screen.getByText('Sync source not found.')).toBeTruthy());
  });

  it('renders source name and tabs', async () => {
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Main Docs')).toBeTruthy();
      expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Sync Now button for active source on documents tab', async () => {
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeTruthy();
    });
  });

  it('does not render Sync Now button for inactive source', async () => {
    setupFetch(mockActiveSource({ name: 'Inactive Source', isActive: false, cronSchedule: null }));
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Inactive Source')).toBeTruthy();
    });
    expect(screen.queryByText('Sync Now')).toBeFalsy();
  });

  it('renders Purge button on documents tab', async () => {
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Purge')).toBeTruthy();
    });
  });

  it('renders delete button in header for non-config managed source', async () => {
    setupFetch(mockActiveSource({ name: 'Custom Source', managedBy: 'user' }));
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Custom Source')).toBeTruthy();
    });
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('does not render delete button for config-managed source', async () => {
    setupFetch(mockActiveSource({ name: 'Config Source', managedBy: 'config' }));
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Config Source')).toBeTruthy();
    });
    expect(screen.queryByText('Delete')).toBeFalsy();
  });

  it('renders all three tab triggers', async () => {
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getAllByText('Overview').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Sync Log').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "Syncing..." with spinner when a sync is running', async () => {
    setupFetch(mockActiveSource(), [{ id: 'job-1', status: 'running', createdAt: '2025-01-01' }]);
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Syncing...')).toBeTruthy();
    });
    const syncButton = screen.getByText('Syncing...').closest('button');
    expect(syncButton?.disabled).toBe(true);
  });

  it('renders breadcrumb link to sources list', async () => {
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Sources')).toBeTruthy();
    });
  });

  it('renders Sync Now and Purge together on documents tab', async () => {
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeTruthy();
      expect(screen.getByText('Purge')).toBeTruthy();
    });
  });

  it('shows overview tab content when tab is overview', async () => {
    mockUseSearch.mockReturnValue({ tab: 'overview', path: '' });
    setupFetch(mockActiveSource({ name: 'Tab Source' }));
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByTestId('overview-tab')).toBeTruthy();
    });
  });

  it('does not show Sync Now for inactive source without cron', async () => {
    setupFetch(mockActiveSource({ name: 'Paused Source', isActive: false, cronSchedule: null }));
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Paused Source')).toBeTruthy();
    });
    expect(screen.queryByText('Sync Now')).toBeFalsy();
  });

  it('calls sync API when Sync Now button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    setupFetch(mockActiveSource());
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeTruthy();
    });
    mockApiFetch.mockResolvedValue({});
    await user.click(screen.getByText('Sync Now'));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('renders description with config and schedule', async () => {
    setupFetch(mockActiveSource({ name: 'Desc Source' }));
    renderWithQueryClient(<SyncSourceDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/s3:\/\/bucket/)).toBeTruthy();
      expect(screen.getByText(/Every 6h/)).toBeTruthy();
    });
  });
});
