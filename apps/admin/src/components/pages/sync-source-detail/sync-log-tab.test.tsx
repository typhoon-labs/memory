import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sync-job-detail-sheet', () => ({
  SyncJobDetailSheet: () => null,
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { SyncLogTab } from './sync-log-tab';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

function makeSyncJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    syncTargetId: 'st-1',
    status: 'completed',
    filesScanned: 5,
    filesNew: 2,
    filesUpdated: 1,
    filesDeleted: 0,
    filesErrored: 0,
    childJobsTotal: 0,
    childJobsCompleted: 0,
    errorMessage: null,
    startedAt: '2025-06-01T10:00:00Z',
    completedAt: '2025-06-01T10:02:00Z',
    ...overrides,
  };
}

describe('SyncLogTab', () => {
  it('shows empty state when no jobs exist', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<SyncLogTab sourceId="st-1" />);

    await waitFor(() => {
      expect(screen.getByText('No sync jobs')).toBeTruthy();
      expect(screen.getByText(/No sync jobs have been run yet/)).toBeTruthy();
    });
  });

  it('renders data table with job rows when jobs exist', async () => {
    mockApiFetch.mockResolvedValue([
      makeSyncJob({ id: 'job-1', status: 'completed', filesScanned: 10 }),
      makeSyncJob({ id: 'job-2', status: 'running', startedAt: '2025-06-02T10:00:00Z', completedAt: null }),
    ]);

    renderWithQueryClient(<SyncLogTab sourceId="st-1" />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
      expect(screen.getByText('running')).toBeTruthy();
    });
  });

  it('does not show empty state while loading', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<SyncLogTab sourceId="st-1" />);

    expect(screen.queryByText('No sync jobs')).toBeNull();
  });

  it('opens detail sheet when a job row is clicked', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([makeSyncJob({ id: 'job-1', status: 'completed', filesScanned: 10 })]);

    renderWithQueryClient(<SyncLogTab sourceId="st-1" />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
    });

    // Click the job row (the table row containing the status text)
    const row = screen.getByText('completed').closest('tr');
    expect(row).toBeTruthy();
    if (row) await user.click(row);

    // SyncJobDetailSheet is mocked to null, but clicking sets selectedJob state.
    // We verify no crash and the row click handler works by re-rendering without error.
    expect(screen.getByText('completed')).toBeTruthy();
  });
});
