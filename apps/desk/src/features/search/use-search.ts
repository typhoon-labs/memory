import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

interface SearchResult {
  text: string;
  score: number;
  metadata: {
    documentId?: string;
    syncTargetId?: string;
    source?: string;
    title?: string;
    startIndex?: number | null;
  };
}

interface HybridSearchResponse {
  results?: SearchResult[];
}

interface SearchOptions {
  query: string;
  expanded?: boolean;
  topK?: number;
  minScore?: number;
  rerank?: boolean;
  enabled?: boolean;
}

/**
 * Query hook for hybrid search. Performs a search when `enabled` is true
 * (defaults to `!!query`). Returns results plus loading/error state.
 */
export function useSearch({ query, expanded, topK, minScore, rerank, enabled }: SearchOptions) {
  const trimmed = query.trim();
  const shouldRun = enabled ?? !!trimmed;

  const filters: Record<string, unknown> = {};
  if (expanded) filters.expanded = true;
  if (topK !== null && topK !== undefined) filters.topK = topK;
  if (minScore !== null && minScore !== undefined) filters.minScore = minScore;
  if (rerank !== null && rerank !== undefined) filters.rerank = rerank;

  return useQuery<SearchResult[]>({
    queryKey: queryKeys.search.results(trimmed, filters),
    queryFn: async () => {
      const data = await apiFetch<HybridSearchResponse>('/api/v1/search/hybrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, ...filters }),
      });
      return data.results ?? [];
    },
    enabled: shouldRun,
  });
}

export type { SearchResult };
