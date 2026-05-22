import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { experimentsApi } from './experiments.api';
import { experimentsQueries } from './experiments.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('experimentsApi', () => {
  it('list calls correct URL without params', async () => {
    await experimentsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments');
  });

  it('list includes pagination and status params', async () => {
    await experimentsApi.list({ page: 1, perPage: 20, status: 'completed' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('page=1');
    expect(url).toContain('perPage=20');
    expect(url).toContain('status=completed');
  });

  it('getById calls correct URL', async () => {
    await experimentsApi.getById('exp-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments/exp-1');
  });

  it('create uses POST method with body', async () => {
    const data = { name: 'Test', datasetId: 'ds-1', scorerIds: ['s-1'] };
    await experimentsApi.create(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('delete uses DELETE method', async () => {
    await experimentsApi.delete('exp-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments/exp-1', {
      method: 'DELETE',
    });
  });

  it('getResults calls correct URL without params', async () => {
    await experimentsApi.getResults('exp-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments/exp-1/results');
  });

  it('getResults includes pagination params', async () => {
    await experimentsApi.getResults('exp-1', { page: 2, perPage: 50 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/experiments/exp-1/results?');
    expect(url).toContain('page=2');
    expect(url).toContain('perPage=50');
  });

  it('compare calls correct URL with encoded params', async () => {
    await experimentsApi.compare('exp-1', 'exp-2');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments/compare?a=exp-1&b=exp-2');
  });

  it('compare encodes special characters', async () => {
    await experimentsApi.compare('a b', 'c&d');
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain(`a=${encodeURIComponent('a b')}`);
    expect(url).toContain(`b=${encodeURIComponent('c&d')}`);
  });
});

describe('experimentsQueries', () => {
  it('list returns correct query key', () => {
    const opts = experimentsQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.experiments.list());
  });

  it('list queryFn calls experimentsApi.list', async () => {
    const opts = experimentsQueries.list();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/admin/experiments');
  });

  it('detail returns correct query key', () => {
    const opts = experimentsQueries.detail('exp-1');
    expect(opts.queryKey).toEqual(queryKeys.experiments.detail('exp-1'));
  });

  it('detail is enabled when id is provided', () => {
    const opts = experimentsQueries.detail('exp-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when id is empty', () => {
    const opts = experimentsQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('results returns correct query key', () => {
    const opts = experimentsQueries.results('exp-1');
    expect(opts.queryKey).toEqual(queryKeys.experiments.results('exp-1'));
  });

  it('results is enabled when id is provided', () => {
    const opts = experimentsQueries.results('exp-1');
    expect(opts.enabled).toBe(true);
  });

  it('results is disabled when id is empty', () => {
    const opts = experimentsQueries.results('');
    expect(opts.enabled).toBe(false);
  });

  it('results queryFn calls experimentsApi.getResults', async () => {
    const opts = experimentsQueries.results('exp-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/admin/experiments/exp-1/results');
  });

  it('compare returns correct query key', () => {
    const opts = experimentsQueries.compare(['exp-1', 'exp-2']);
    expect(opts.queryKey).toEqual(queryKeys.experiments.compare(['exp-1', 'exp-2']));
  });

  it('compare is enabled when exactly 2 ids', () => {
    const opts = experimentsQueries.compare(['exp-1', 'exp-2']);
    expect(opts.enabled).toBe(true);
  });

  it('compare is disabled when fewer than 2 ids', () => {
    const opts = experimentsQueries.compare(['exp-1']);
    expect(opts.enabled).toBe(false);
  });

  it('compare is disabled when more than 2 ids', () => {
    const opts = experimentsQueries.compare(['exp-1', 'exp-2', 'exp-3']);
    expect(opts.enabled).toBe(false);
  });

  it('compare queryFn calls experimentsApi.compare', async () => {
    const opts = experimentsQueries.compare(['exp-1', 'exp-2']);
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/experiments/compare');
  });
});
