import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((config: unknown) => config),
}));

vi.mock('@typhoon/ui', () => ({
  apiFetch: vi.fn().mockResolvedValue({ results: [{ text: 'hit', score: 0.9, metadata: {} }] }),
}));

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return { queryKeys: actual.queryKeys };
});

import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

import { useSearch } from './use-search';

type QueryConfig = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  enabled: boolean;
};

describe('useSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is disabled when query is empty', () => {
    const config = useSearch({ query: '' }) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);
  });

  it('is disabled when query is whitespace-only', () => {
    const config = useSearch({ query: '   ' }) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);
  });

  it('is enabled when query is non-empty', () => {
    const config = useSearch({ query: 'test' }) as unknown as QueryConfig;
    expect(config.enabled).toBe(true);
  });

  it('respects explicit enabled override', () => {
    const config = useSearch({ query: 'test', enabled: false }) as unknown as QueryConfig;
    expect(config.enabled).toBe(false);
  });

  it('builds correct queryKey with trimmed query', () => {
    const config = useSearch({ query: '  test  ' }) as unknown as QueryConfig;
    expect(config.queryKey).toEqual(queryKeys.search.results('test', {}));
  });

  it('includes filter options in queryKey', () => {
    const config = useSearch({
      query: 'test',
      expanded: true,
      topK: 5,
      minScore: 0.5,
      rerank: true,
    }) as unknown as QueryConfig;

    expect(config.queryKey).toEqual(
      queryKeys.search.results('test', { expanded: true, topK: 5, minScore: 0.5, rerank: true }),
    );
  });

  it('queryFn calls apiFetch with POST and search params', async () => {
    const config = useSearch({ query: 'test', topK: 10 }) as unknown as QueryConfig;
    await config.queryFn();

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 10 }),
    });
  });

  it('queryFn returns empty array when response has no results', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const config = useSearch({ query: 'test' }) as unknown as QueryConfig;
    const result = await config.queryFn();

    expect(result).toEqual([]);
  });

  it('queryFn returns results from response', async () => {
    const config = useSearch({ query: 'test' }) as unknown as QueryConfig;
    const result = await config.queryFn();

    expect(result).toEqual([{ text: 'hit', score: 0.9, metadata: {} }]);
  });
});
