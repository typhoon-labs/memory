import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { FailedJobsTab } from './failed-jobs-tab';

const mockApiFetch = vi.mocked(apiFetch);

interface FailedJob {
  id: string;
  queue: string;
  jobName: string;
  jobId: string;
  data: unknown;
  failedReason: string | null;
  stacktrace: string | null;
  attemptsMade: number;
  syncTargetId: string | null;
  documentId: string | null;
  createdAt: string;
}

function makeFailedJob(overrides: Partial<FailedJob> = {}): FailedJob {
  return {
    id: 'fj-001',
    queue: 'ingestion',
    jobName: 'ingest-document',
    jobId: 'job-abc',
    data: { documentId: 'doc-1' },
    failedReason: 'Timeout exceeded',
    stacktrace: null,
    attemptsMade: 3,
    syncTargetId: null,
    documentId: null,
    createdAt: '2025-06-01T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('FailedJobsTab', () => {
  it('renders job table with failed job data', async () => {
    const jobs: FailedJob[] = [
      makeFailedJob({ id: 'fj-001', jobId: 'job-abc', jobName: 'ingest-document', attemptsMade: 3 }),
      makeFailedJob({ id: 'fj-002', jobId: 'job-def', jobName: 'score-message', attemptsMade: 1 }),
    ];
    mockApiFetch.mockResolvedValue(jobs);

    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      expect(screen.getByText('ingest-document')).toBeTruthy();
      expect(screen.getByText('score-message')).toBeTruthy();
      expect(screen.getByText('job-abc')).toBeTruthy();
      expect(screen.getByText('job-def')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockResolvedValue([makeFailedJob()]);

    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      expect(screen.getByText('Job ID')).toBeTruthy();
      expect(screen.getByText('Type')).toBeTruthy();
      expect(screen.getByText('Error')).toBeTruthy();
      expect(screen.getByText('Attempts')).toBeTruthy();
      expect(screen.getByText('Failed At')).toBeTruthy();
    });
  });

  it('shows empty state when no failed jobs', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      expect(screen.getByText('No archived failures')).toBeTruthy();
      expect(screen.getByText('Terminal job failures are archived here permanently for debugging.')).toBeTruthy();
    });
  });

  it('displays error reason for failed jobs', async () => {
    mockApiFetch.mockResolvedValue([makeFailedJob({ failedReason: 'Connection refused' })]);

    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeTruthy();
    });
  });

  it('shows dash when failedReason is null', async () => {
    mockApiFetch.mockResolvedValue([makeFailedJob({ failedReason: null })]);

    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      expect(screen.getByText('-')).toBeTruthy();
    });
  });

  it('renders attempts count', async () => {
    mockApiFetch.mockResolvedValue([makeFailedJob({ attemptsMade: 5 })]);

    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy();
    });
  });

  it('renders delete button for each job', async () => {
    mockApiFetch.mockResolvedValue([makeFailedJob()]);

    const { container } = renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);

    await waitFor(() => {
      const trashIcons = container.querySelectorAll('.lucide-trash-2');
      expect(trashIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('fetches failed jobs with correct query parameters', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    renderWithQueryClient(<FailedJobsTab queueName="scoring" />);

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/failed-jobs?queue=scoring&limit=100');
  });

  it('opens detail sheet when a job row is clicked', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([
      makeFailedJob({
        id: 'fj-click',
        jobId: 'job-xyz',
        jobName: 'process-doc',
        failedReason: 'Parse error',
        attemptsMade: 2,
        syncTargetId: 'st-42',
        documentId: 'doc-99',
        data: { key: 'value' },
        stacktrace: 'Error: oops\n  at file.ts:10',
      }),
    ]);
    renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);
    await screen.findByText('process-doc');

    // Click the row
    await user.click(screen.getByText('process-doc'));

    // Sheet should open with job details
    expect(screen.getByText('Failed Job: process-doc (job-xyz)')).toBeTruthy();
    // Parse error appears in both the table and the sheet
    expect(screen.getAllByText('Parse error').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('st-42')).toBeTruthy();
    expect(screen.getByText('doc-99')).toBeTruthy();
    expect(screen.getByText(/"key": "value"/)).toBeTruthy();
    expect(screen.getByText(/Error: oops/)).toBeTruthy();
  });

  it('shows delete confirmation dialog when trash button is clicked', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    mockApiFetch.mockResolvedValue([makeFailedJob({ id: 'fj-del', jobName: 'del-job' })]);
    const { container } = renderWithQueryClient(<FailedJobsTab queueName="ingestion" />);
    await screen.findByText('del-job');

    const trashBtn = container.querySelector('.lucide-trash-2')?.closest('button') as HTMLElement;
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn);

    expect(screen.getByText('Delete archived failure?')).toBeTruthy();
    expect(screen.getByText('This will permanently remove this failure record.')).toBeTruthy();
  });
});
