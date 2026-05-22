import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual };
});

vi.mock('./shared', () => ({
  formatJobDuration: vi.fn((processedOn: number | null, _finishedOn: number | null) => {
    if (!processedOn) return '\u2014';
    return '5s';
  }),
  formatTimestamp: vi.fn((ts: number | null) => {
    if (!ts) return '\u2014';
    return '1/1/2025, 12:00:00 AM';
  }),
  isStageProgress: vi.fn(() => false),
  JOB_STATE_BADGE_MAP: {
    waiting: 'pending',
    active: 'warning',
    completed: 'success',
    failed: 'error',
    delayed: 'info',
  },
}));

import { JobDetailSheet } from './job-detail-sheet';
import type { QueueJob } from './shared';

function makeJob(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-001',
    name: 'ingest-document',
    data: { documentId: 'doc-1' },
    state: 'completed',
    attemptsMade: 1,
    timestamp: 1704067200000,
    processedOn: 1704067200000,
    finishedOn: 1704067205000,
    failedReason: null,
    returnvalue: null,
    stacktrace: [],
    progress: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('JobDetailSheet', () => {
  it('renders job name and state when open', () => {
    const job = makeJob({ name: 'ingest-document', state: 'completed' });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('ingest-document')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('renders nothing when job is null', () => {
    render(<JobDetailSheet job={null} open={true} onOpenChange={vi.fn()} />);

    // The Sheet renders but there's no inner content (the component returns null for null job)
    expect(screen.queryByText('ingest-document')).toBeNull();
  });

  it('displays timing information', () => {
    const job = makeJob();

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Timing')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('Attempts')).toBeTruthy();
  });

  it('displays job data as JSON', () => {
    const job = makeJob({ data: { documentId: 'doc-42' } });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Job Data')).toBeTruthy();
    expect(screen.getByText(/"documentId": "doc-42"/)).toBeTruthy();
  });

  it('displays stacktrace when present', () => {
    const job = makeJob({ stacktrace: ['Error: Something went wrong', '  at handler (worker.ts:10)'] });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Stacktrace')).toBeTruthy();
    expect(screen.getByText(/Something went wrong/)).toBeTruthy();
  });

  it('does not display stacktrace section when empty', () => {
    const job = makeJob({ stacktrace: [] });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Stacktrace')).toBeNull();
  });

  it('displays return value when present', () => {
    const job = makeJob({ returnvalue: { result: 'success' } });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Return Value')).toBeTruthy();
    expect(screen.getByText(/"result": "success"/)).toBeTruthy();
  });

  it('displays string return value directly', () => {
    const job = makeJob({ returnvalue: 'done' });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Return Value')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
  });

  it('does not display return value section when null', () => {
    const job = makeJob({ returnvalue: null });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Return Value')).toBeNull();
  });

  it('displays warnings when present in return value', () => {
    const job = makeJob({ returnvalue: { warnings: ['Low confidence score', 'Missing metadata'] } });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Warnings')).toBeTruthy();
    expect(screen.getByText('Low confidence score')).toBeTruthy();
    expect(screen.getByText('Missing metadata')).toBeTruthy();
  });

  it('displays attempts count', () => {
    const job = makeJob({ attemptsMade: 5 });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('5')).toBeTruthy();
  });

  it('displays Processing Started when processedOn is present', () => {
    const job = makeJob({ processedOn: 1704067200000, finishedOn: null });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Processing Started')).toBeTruthy();
  });

  it('displays Finished when finishedOn is present', () => {
    const job = makeJob({ processedOn: 1704067200000, finishedOn: 1704067205000 });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Finished')).toBeTruthy();
  });

  it('hides Processing Started when processedOn is null', () => {
    const job = makeJob({ processedOn: null, finishedOn: null });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Processing Started')).toBeNull();
  });

  it('displays stage progress section when isStageProgress returns true', async () => {
    const shared = await import('./shared');
    vi.mocked(shared.isStageProgress).mockReturnValue(true);

    const job = makeJob({
      state: 'active',
      progress: { stage: 'Extracting text', startedAt: Date.now() - 5000 },
    });

    render(<JobDetailSheet job={job} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Current Stage')).toBeTruthy();
    expect(screen.getByText('Extracting text')).toBeTruthy();
  });
});
