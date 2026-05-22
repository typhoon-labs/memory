import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { queuesApi } from './queues.api';
import { queuesQueries } from './queues.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('queuesApi', () => {
  it('list calls correct URL', async () => {
    await queuesApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues');
  });

  it('listWorkers calls correct URL with encoded name', async () => {
    await queuesApi.listWorkers('sync-queue');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/sync-queue/workers');
  });

  it('listWorkers encodes special characters', async () => {
    await queuesApi.listWorkers('a b');
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/queues/${encodeURIComponent('a b')}/workers`);
  });

  it('listJobs calls correct URL without params', async () => {
    await queuesApi.listJobs('sync');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/sync/jobs');
  });

  it('listJobs includes state and pagination params', async () => {
    await queuesApi.listJobs('sync', { state: 'failed', start: 0, pageSize: 20 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/queues/sync/jobs?');
    expect(url).toContain('state=failed');
    expect(url).toContain('start=0');
    expect(url).toContain('pageSize=20');
  });

  it('pauseQueue uses POST method', async () => {
    await queuesApi.pauseQueue('sync');
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/queues/${encodeURIComponent('sync')}/pause`, {
      method: 'POST',
    });
  });

  it('resumeQueue uses POST method', async () => {
    await queuesApi.resumeQueue('sync');
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/queues/${encodeURIComponent('sync')}/resume`, {
      method: 'POST',
    });
  });

  it('cleanQueue uses POST method with body', async () => {
    const data = { grace: 3600, status: 'completed' };
    await queuesApi.cleanQueue('sync', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/queues/${encodeURIComponent('sync')}/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('retryJob uses POST method', async () => {
    await queuesApi.retryJob('sync', 'job-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/queues/${encodeURIComponent('sync')}/jobs/${encodeURIComponent('job-1')}/retry`,
      { method: 'POST' },
    );
  });

  it('removeJob uses DELETE method', async () => {
    await queuesApi.removeJob('sync', 'job-1');
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/queues/${encodeURIComponent('sync')}/jobs/${encodeURIComponent('job-1')}`,
      { method: 'DELETE' },
    );
  });

  it('listFailedJobs calls correct URL without params', async () => {
    await queuesApi.listFailedJobs();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/failed-jobs');
  });

  it('listFailedJobs includes query params', async () => {
    await queuesApi.listFailedJobs({ limit: 10, offset: 5, queue: 'sync' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
    expect(url).toContain('queue=sync');
  });

  it('getFailedJob calls correct URL', async () => {
    await queuesApi.getFailedJob('fj-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/failed-jobs/fj-1');
  });

  it('deleteFailedJob uses DELETE method', async () => {
    await queuesApi.deleteFailedJob('fj-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues/failed-jobs/fj-1', {
      method: 'DELETE',
    });
  });
});

describe('queuesQueries', () => {
  it('list returns correct query key', () => {
    const opts = queuesQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.queues.list());
  });

  it('list queryFn calls queuesApi.list', async () => {
    const opts = queuesQueries.list();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/queues');
  });

  it('detail returns correct query key', () => {
    const opts = queuesQueries.detail('sync');
    expect(opts.queryKey).toEqual(queryKeys.queues.detail('sync'));
  });

  it('detail is enabled when name is provided', () => {
    const opts = queuesQueries.detail('sync');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when name is empty', () => {
    const opts = queuesQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls queuesApi.listWorkers', async () => {
    const opts = queuesQueries.detail('sync');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/queues/sync/workers');
  });

  it('jobs returns correct query key', () => {
    const opts = queuesQueries.jobs('sync', 'failed');
    expect(opts.queryKey).toEqual(queryKeys.queues.jobs('sync', 'failed'));
  });

  it('jobs is enabled when name is provided', () => {
    const opts = queuesQueries.jobs('sync');
    expect(opts.enabled).toBe(true);
  });

  it('jobs is disabled when name is empty', () => {
    const opts = queuesQueries.jobs('');
    expect(opts.enabled).toBe(false);
  });

  it('jobs queryFn calls queuesApi.listJobs with state', async () => {
    const opts = queuesQueries.jobs('sync', 'failed');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/queues/sync/jobs');
    expect(url).toContain('state=failed');
  });

  it('failedJobs returns correct query key', () => {
    const opts = queuesQueries.failedJobs();
    expect(opts.queryKey).toEqual(queryKeys.queues.failedJobs());
  });

  it('failedJobs queryFn calls queuesApi.listFailedJobs', async () => {
    const opts = queuesQueries.failedJobs();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/queues/failed-jobs');
  });
});
