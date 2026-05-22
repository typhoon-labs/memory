import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { tracesApi } from './traces.api';
import { tracesQueries } from './traces.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tracesApi', () => {
  it('list calls correct URL without params', async () => {
    await tracesApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/traces');
  });

  it('list includes filter params', async () => {
    await tracesApi.list({ threadId: 't-1', status: 'error' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/traces?');
    expect(url).toContain('threadId=t-1');
    expect(url).toContain('status=error');
  });

  it('list skips undefined values in params', async () => {
    await tracesApi.list({ threadId: 't-1', status: undefined });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('threadId=t-1');
    expect(url).not.toContain('status');
  });

  it('getDetail calls correct URL', async () => {
    await tracesApi.getDetail('trace-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/traces/trace-1');
  });
});

describe('tracesQueries', () => {
  it('list returns correct query key without filters', () => {
    const opts = tracesQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.traces.list());
  });

  it('list returns correct query key with filters', () => {
    const filters = { threadId: 't-1', status: 'error' };
    const opts = tracesQueries.list(filters);
    expect(opts.queryKey).toEqual(queryKeys.traces.list(filters));
  });

  it('list queryFn calls tracesApi.list', async () => {
    const filters = { threadId: 't-1' };
    const opts = tracesQueries.list(filters);
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('threadId=t-1');
  });

  it('detail returns correct query key', () => {
    const opts = tracesQueries.detail('trace-1');
    expect(opts.queryKey).toEqual(queryKeys.traces.detail('trace-1'));
  });

  it('detail is enabled when traceId is provided', () => {
    const opts = tracesQueries.detail('trace-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when traceId is empty', () => {
    const opts = tracesQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls tracesApi.getDetail', async () => {
    const opts = tracesQueries.detail('trace-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/traces/trace-1');
  });
});
