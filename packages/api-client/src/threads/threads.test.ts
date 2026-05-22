import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { threadsApi } from './threads.api';
import { threadsQueries } from './threads.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('threadsApi', () => {
  it('list calls correct URL without params', async () => {
    await threadsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/threads');
  });

  it('list includes pagination params', async () => {
    await threadsApi.list({ page: 2, perPage: 25 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('perPage=25');
  });

  it('getById calls correct URL', async () => {
    await threadsApi.getById('t-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/threads/t-1');
  });

  it('create uses POST method with body', async () => {
    const data = { title: 'New conversation' };
    await threadsApi.create(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('update uses PATCH method with body', async () => {
    const data = { title: 'Updated title' };
    await threadsApi.update('t-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/threads/t-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('delete uses DELETE method', async () => {
    await threadsApi.delete('t-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/threads/t-1', {
      method: 'DELETE',
    });
  });
});

describe('threadsQueries', () => {
  it('list returns correct query key', () => {
    const opts = threadsQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.threads.list());
  });

  it('list queryFn calls threadsApi.list', async () => {
    const opts = threadsQueries.list();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/threads');
  });

  it('detail returns correct query key', () => {
    const opts = threadsQueries.detail('t-1');
    expect(opts.queryKey).toEqual(queryKeys.threads.detail('t-1'));
  });

  it('detail is enabled when threadId is provided', () => {
    const opts = threadsQueries.detail('t-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when threadId is empty', () => {
    const opts = threadsQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls threadsApi.getById', async () => {
    const opts = threadsQueries.detail('t-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/threads/t-1');
  });
});
