import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { searchApi } from './search.api';
import { searchQueries } from './search.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchApi', () => {
  it('vectorSearch uses POST method with body', async () => {
    const data = { query: 'how to reset password', topK: 5 };
    await searchApi.vectorSearch(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('hybridSearch uses POST method with body', async () => {
    const data = { query: 'password reset', topK: 10 };
    await searchApi.hybridSearch(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });
});

describe('searchQueries', () => {
  it('results returns correct query key', () => {
    const opts = searchQueries.results('hello');
    expect(opts.queryKey).toEqual(queryKeys.search.results('hello'));
  });

  it('results with filters returns correct query key', () => {
    const filters = { syncTargetId: 'st-1' };
    const opts = searchQueries.results('hello', filters);
    expect(opts.queryKey).toEqual(queryKeys.search.results('hello', filters));
  });

  it('results is enabled when query is provided', () => {
    const opts = searchQueries.results('hello');
    expect(opts.enabled).toBe(true);
  });

  it('results is disabled when query is empty', () => {
    const opts = searchQueries.results('');
    expect(opts.enabled).toBe(false);
  });

  it('results queryFn calls searchApi.hybridSearch', async () => {
    const opts = searchQueries.results('hello', { syncTargetId: 'st-1' });
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/search/hybrid', expect.objectContaining({ method: 'POST' }));
  });

  it('results queryFn passes query and filters to hybridSearch', async () => {
    const opts = searchQueries.results('test query', { syncTargetId: 'st-1' });
    await opts.queryFn!({} as never);
    const body = JSON.parse(mockApiFetch.mock.calls[0][1]?.body as string);
    expect(body.query).toBe('test query');
    expect(body.syncTargetId).toBe('st-1');
  });
});
