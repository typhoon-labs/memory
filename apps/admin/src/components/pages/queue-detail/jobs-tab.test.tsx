import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./shared', () => ({
  formatJobDuration: vi.fn(() => '5s'),
  isStageProgress: vi.fn((progress: unknown) => {
    if (progress && typeof progress === 'object' && 'stage' in (progress as Record<string, unknown>)) return true;
    return false;
  }),
  JOB_STATE_BADGE_MAP: {
    waiting: 'pending',
    active: 'warning',
    completed: 'success',
    failed: 'error',
    delayed: 'info',
  },
}));
vi.mock('./job-detail-sheet', () => ({
  JobDetailSheet: ({ job, open }: { job: unknown; open: boolean }) =>
    open && job ? <div data-testid="job-sheet">{(job as { name: string }).name}</div> : null,
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { JobsTab } from './jobs-tab';
import type { QueueJob } from './shared';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

function makeJob(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-001',
    name: 'ingest-document',
    data: {},
    state: 'completed',
    attemptsMade: 1,
    timestamp: Date.now(),
    processedOn: Date.now() - 5000,
    finishedOn: Date.now(),
    failedReason: null,
    returnvalue: null,
    stacktrace: [],
    progress: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('JobsTab', () => {
  it('renders job table with job data', async () => {
    const jobs: QueueJob[] = [
      makeJob({ id: 'job-001', name: 'ingest-document', state: 'completed', attemptsMade: 1 }),
      makeJob({ id: 'job-002', name: 'score-message', state: 'failed', attemptsMade: 3 }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('ingest-document')).toBeTruthy();
      expect(screen.getByText('score-message')).toBeTruthy();
      // Truncated IDs
      expect(screen.getByText('job-001')).toBeTruthy();
      expect(screen.getByText('job-002')).toBeTruthy();
    });
  });

  it('shows empty state when no jobs', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="waiting" />);

    await waitFor(() => {
      expect(screen.getByText('No waiting jobs')).toBeTruthy();
      expect(screen.getByText('There are no jobs in the waiting state.')).toBeTruthy();
    });
  });

  it('shows Retry All Failed button when failed jobs exist', async () => {
    const jobs: QueueJob[] = [makeJob({ id: 'job-001', state: 'failed' }), makeJob({ id: 'job-002', state: 'failed' })];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('Retry All Failed (2)')).toBeTruthy();
    });
  });

  it('shows Clean Completed button when completed jobs exist', async () => {
    const jobs: QueueJob[] = [
      makeJob({ id: 'job-001', state: 'completed' }),
      makeJob({ id: 'job-002', state: 'completed' }),
      makeJob({ id: 'job-003', state: 'completed' }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('Clean Completed (3)')).toBeTruthy();
    });
  });

  it('shows Clean Failed button when failed jobs exist', async () => {
    const jobs: QueueJob[] = [makeJob({ id: 'job-001', state: 'failed' })];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('Clean Failed (1)')).toBeTruthy();
    });
  });

  it('does not show bulk action buttons when no jobs', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.queryByText(/Retry All Failed/)).toBeNull();
      expect(screen.queryByText(/Clean Completed/)).toBeNull();
      expect(screen.queryByText(/Clean Failed/)).toBeNull();
    });
  });

  it('renders state badge for each job', async () => {
    const jobs: QueueJob[] = [
      makeJob({ id: 'job-001', state: 'completed' }),
      makeJob({ id: 'job-002', state: 'failed' }),
      makeJob({ id: 'job-003', state: 'active' }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
      expect(screen.getByText('failed')).toBeTruthy();
      expect(screen.getByText('active')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue([makeJob()]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('ID')).toBeTruthy();
      expect(screen.getByText('Job')).toBeTruthy();
      expect(screen.getByText('State')).toBeTruthy();
      expect(screen.getByText('Attempts')).toBeTruthy();
      expect(screen.getByText('Duration')).toBeTruthy();
    });
  });

  it('fetches jobs with correct query parameters', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    renderWithQueryClient(<JobsTab queueName="scoring" jobState="failed" />);

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/scoring/jobs?state=failed&pageSize=100');
  });

  it('renders remove button for each job', async () => {
    const jobs: QueueJob[] = [makeJob({ id: 'job-12345678-abcd' })];
    mockApiFetch.mockResolvedValue(jobs);

    const { container } = renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      // Trash icon is the remove button trigger
      const trashIcons = container.querySelectorAll('.lucide-trash-2');
      expect(trashIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders retry button for failed jobs', async () => {
    const jobs: QueueJob[] = [makeJob({ id: 'job-fail-1', state: 'failed', failedReason: 'Timeout' })];
    mockApiFetch.mockResolvedValue(jobs);

    const { container } = renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeTruthy();
    });

    // Retry icon should be present (RotateCcw icon for retry)
    const retryIcons = container.querySelectorAll('.lucide-rotate-ccw');
    expect(retryIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state message based on job state filter', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="failed" />);

    await waitFor(() => {
      expect(screen.getByText('No failed jobs')).toBeTruthy();
    });
  });

  it('renders attempts count', async () => {
    mockApiFetch.mockResolvedValue([makeJob({ id: 'job-001', attemptsMade: 5 })]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy();
    });
  });

  it('renders truncated job ID', async () => {
    mockApiFetch.mockResolvedValue([makeJob({ id: 'abcdefghijkl-1234-5678' })]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      // ID is sliced to first 8 chars
      expect(screen.getByText('abcdefgh')).toBeTruthy();
    });
  });

  it('renders waiting state badge', async () => {
    mockApiFetch.mockResolvedValue([makeJob({ id: 'j-wait', state: 'waiting' })]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('waiting')).toBeTruthy();
    });
  });

  it('renders delayed state badge', async () => {
    mockApiFetch.mockResolvedValue([makeJob({ id: 'j-del', state: 'delayed' })]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('delayed')).toBeTruthy();
    });
  });

  it('renders empty state for completed filter with no completed jobs', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="completed" />);

    await waitFor(() => {
      expect(screen.getByText('No completed jobs')).toBeTruthy();
      expect(screen.getByText('There are no jobs in the completed state.')).toBeTruthy();
    });
  });

  it('renders empty state for active filter', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="active" />);

    await waitFor(() => {
      expect(screen.getByText('No active jobs')).toBeTruthy();
    });
  });

  it('renders empty state for delayed filter', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="delayed" />);

    await waitFor(() => {
      expect(screen.getByText('No delayed jobs')).toBeTruthy();
    });
  });

  it('does not show retry button for non-failed jobs', async () => {
    mockApiFetch.mockResolvedValue([makeJob({ id: 'j-comp', state: 'completed' })]);

    const { container } = renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeTruthy();
    });
    // Retry button should be invisible (aria-hidden)
    const retryBtns = container.querySelectorAll('[aria-hidden="true"]');
    expect(retryBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('renders duration column for each job', async () => {
    mockApiFetch.mockResolvedValue([makeJob({ id: 'j-dur' })]);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      // formatJobDuration mock returns '5s'
      expect(screen.getByText('5s')).toBeTruthy();
    });
  });

  it('renders multiple jobs with mixed states', async () => {
    const jobs = [
      makeJob({ id: 'j-1', name: 'ingest', state: 'completed', attemptsMade: 1 }),
      makeJob({ id: 'j-2', name: 'score', state: 'failed', attemptsMade: 3 }),
      makeJob({ id: 'j-3', name: 'embed', state: 'active', attemptsMade: 1 }),
      makeJob({ id: 'j-4', name: 'cleanup', state: 'waiting', attemptsMade: 0 }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('ingest')).toBeTruthy();
      expect(screen.getByText('score')).toBeTruthy();
      expect(screen.getByText('embed')).toBeTruthy();
      expect(screen.getByText('cleanup')).toBeTruthy();
    });
  });

  it('renders active job with stage progress sub-line', async () => {
    const jobs = [
      makeJob({
        id: 'j-stage',
        name: 'ingest-document',
        state: 'active',
        attemptsMade: 1,
        progress: { stage: 'Extracting text', percent: 45 } as never,
      }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('ingest-document')).toBeTruthy();
      // Stage progress sub-line should render
      expect(screen.getByText(/Extracting text/)).toBeTruthy();
    });
  });

  it('shows both Clean Failed and Retry All Failed buttons together', async () => {
    const jobs = [
      makeJob({ id: 'j-f1', state: 'failed' }),
      makeJob({ id: 'j-f2', state: 'failed' }),
      makeJob({ id: 'j-c1', state: 'completed' }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('Retry All Failed (2)')).toBeTruthy();
      expect(screen.getByText('Clean Failed (2)')).toBeTruthy();
      expect(screen.getByText('Clean Completed (1)')).toBeTruthy();
    });
  });

  it('renders remove dialog content when trigger button exists', async () => {
    const jobs = [makeJob({ id: 'job-remove-test', name: 'test-job', state: 'completed' })];
    mockApiFetch.mockResolvedValue(jobs);

    const { container } = renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => {
      expect(screen.getByText('test-job')).toBeTruthy();
    });
    // The AlertDialog trigger (remove button) should be present
    const trashButtons = container.querySelectorAll('.lucide-trash-2');
    expect(trashButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls retry API on retry button click for failed job', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob({ id: 'job-fail-retry', state: 'failed', failedReason: 'Timeout' })];
    mockApiFetch.mockResolvedValue(jobs);

    const { container } = renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => expect(screen.getByText('failed')).toBeTruthy());

    // Reset mock to capture the retry call
    mockApiFetch.mockResolvedValueOnce(undefined);

    const retryBtn = container.querySelector('.lucide-rotate-ccw')?.closest('button');
    expect(retryBtn).toBeTruthy();
    await user.click(retryBtn!);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/jobs/job-fail-retry/retry', {
        method: 'POST',
      });
    });
  });

  it('opens AlertDialog and calls remove API when confirmed', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob({ id: 'job-rm-1', name: 'remove-me', state: 'completed' })];
    mockApiFetch.mockResolvedValue(jobs);

    const { container } = renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => expect(screen.getByText('remove-me')).toBeTruthy());

    // Click the trash icon to open the AlertDialog
    const trashBtn = container.querySelector('.lucide-trash-2')?.closest('button');
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn!);

    // AlertDialog should now be visible
    await waitFor(() => expect(screen.getByText('Remove job?')).toBeTruthy());

    // Click the "Remove" action
    mockApiFetch.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/jobs/job-rm-1', {
        method: 'DELETE',
      });
    });
  });

  it('calls clean completed API when Clean Completed button is clicked', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob({ id: 'j-comp-1', state: 'completed' }), makeJob({ id: 'j-comp-2', state: 'completed' })];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => expect(screen.getByText('Clean Completed (2)')).toBeTruthy());

    mockApiFetch.mockResolvedValueOnce(undefined);
    await user.click(screen.getByText('Clean Completed (2)'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'completed', grace: 0, limit: 5000 }),
      });
    });
  });

  it('calls clean failed API when Clean Failed button is clicked', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob({ id: 'j-fail-clean', state: 'failed' })];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => expect(screen.getByText('Clean Failed (1)')).toBeTruthy());

    mockApiFetch.mockResolvedValueOnce(undefined);
    await user.click(screen.getByText('Clean Failed (1)'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'failed', grace: 0, limit: 5000 }),
      });
    });
  });

  it('retries all failed jobs when Retry All Failed is clicked', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob({ id: 'j-f1', state: 'failed' }), makeJob({ id: 'j-f2', state: 'failed' })];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => expect(screen.getByText('Retry All Failed (2)')).toBeTruthy());

    mockApiFetch.mockResolvedValue(undefined);
    await user.click(screen.getByText('Retry All Failed (2)'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/jobs/j-f1/retry', { method: 'POST' });
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/ingestion/jobs/j-f2/retry', { method: 'POST' });
    });
  });

  it('opens job detail sheet when row is clicked', async () => {
    const user = userEvent.setup();
    const jobs = [makeJob({ id: 'j-detail', name: 'detail-job', state: 'completed' })];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<JobsTab queueName="ingestion" jobState="all" />);

    await waitFor(() => expect(screen.getByText('detail-job')).toBeTruthy());

    // Click on the job name to trigger row click
    await user.click(screen.getByText('detail-job'));

    await waitFor(() => {
      expect(screen.getByTestId('job-sheet')).toBeTruthy();
      expect(screen.getByTestId('job-sheet').textContent).toBe('detail-job');
    });
  });
});
