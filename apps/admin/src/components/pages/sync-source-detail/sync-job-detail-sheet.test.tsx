import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./shared', () => ({
  formatDuration: vi.fn(() => '2m 30s'),
  JOB_STATUS_MAP: { completed: 'success', running: 'info', failed: 'error', pending: 'pending' },
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual };
});

import { render } from '@testing-library/react';

import { SyncJobDetailSheet } from './sync-job-detail-sheet';

const baseJob = {
  id: 'job-1',
  syncTargetId: 'st-1',
  status: 'completed' as const,
  filesScanned: 10,
  filesNew: 3,
  filesUpdated: 2,
  filesDeleted: 1,
  filesErrored: 0,
  childJobsTotal: 0,
  childJobsCompleted: 0,
  errorMessage: null,
  startedAt: '2025-01-01T10:00:00Z',
  completedAt: '2025-01-01T10:02:30Z',
};

describe('SyncJobDetailSheet', () => {
  it('returns null when job is null', () => {
    const { container } = render(<SyncJobDetailSheet job={null} open={true} onOpenChange={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders job title and status badge', () => {
    render(<SyncJobDetailSheet job={baseJob} open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Sync Job')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('renders timing section', () => {
    render(<SyncJobDetailSheet job={baseJob} open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Timing')).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('2m 30s')).toBeTruthy();
  });

  it('renders file statistics', () => {
    render(<SyncJobDetailSheet job={baseJob} open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('File Statistics')).toBeTruthy();
    expect(screen.getByText('Scanned')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
  });

  it('shows error details for failed jobs', () => {
    const failedJob = { ...baseJob, status: 'failed' as const, errorMessage: 'S3 connection timeout' };
    render(<SyncJobDetailSheet job={failedJob} open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Error Details')).toBeTruthy();
    expect(screen.getByText('S3 connection timeout')).toBeTruthy();
  });

  it('does not show error section for non-failed jobs', () => {
    render(<SyncJobDetailSheet job={baseJob} open={true} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Error Details')).toBeFalsy();
  });
});
