import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries })),
}));

vi.mock('@typhoon/ui', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return { queryKeys: actual.queryKeys };
});

import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

import { useCleanQueue, usePauseQueue, useRemoveJob, useResumeQueue, useRetryJob } from './use-queue-mutations';

describe('useRetryJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to retry endpoint', async () => {
    const config = useRetryJob() as unknown as {
      mutationFn: (data: { queueName: string; jobId: string }) => Promise<unknown>;
    };
    await config.mutationFn({ queueName: 'sync', jobId: 'job-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/queues/sync/jobs/job-1/retry', {
      method: 'POST',
    });
  });

  it('invalidates queues.all on success', () => {
    const config = useRetryJob() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
  });
});

describe('useRemoveJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE to job endpoint', async () => {
    const config = useRemoveJob() as unknown as {
      mutationFn: (data: { queueName: string; jobId: string }) => Promise<unknown>;
    };
    await config.mutationFn({ queueName: 'eval', jobId: 'job-2' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/queues/eval/jobs/job-2', {
      method: 'DELETE',
    });
  });

  it('invalidates queues.all on success', () => {
    const config = useRemoveJob() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
  });
});

describe('usePauseQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to pause endpoint', async () => {
    const config = usePauseQueue() as unknown as {
      mutationFn: (name: string) => Promise<unknown>;
    };
    await config.mutationFn('sync');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/queues/sync/pause', { method: 'POST' });
  });

  it('invalidates queues.all on success', () => {
    const config = usePauseQueue() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
  });
});

describe('useResumeQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to resume endpoint', async () => {
    const config = useResumeQueue() as unknown as {
      mutationFn: (name: string) => Promise<unknown>;
    };
    await config.mutationFn('sync');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/queues/sync/resume', { method: 'POST' });
  });

  it('invalidates queues.all on success', () => {
    const config = useResumeQueue() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
  });
});

describe('useCleanQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and clean parameters including defaults', async () => {
    const config = useCleanQueue() as unknown as {
      mutationFn: (data: { queueName: string; state: string }) => Promise<unknown>;
    };
    await config.mutationFn({ queueName: 'sync', state: 'failed' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/queues/sync/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grace: 0, limit: 1000, state: 'failed' }),
    });
  });

  it('allows overriding grace and limit', async () => {
    const config = useCleanQueue() as unknown as {
      mutationFn: (data: { queueName: string; state: string; grace?: number; limit?: number }) => Promise<unknown>;
    };
    await config.mutationFn({ queueName: 'eval', state: 'completed', grace: 5000, limit: 100 });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/queues/eval/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grace: 5000, limit: 100, state: 'completed' }),
    });
  });

  it('invalidates queues.all on success', () => {
    const config = useCleanQueue() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.queues.all });
  });
});
