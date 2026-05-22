import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { searchApi } from './search.api';
import type { HybridSearchInput } from './search.types';

/** TanStack Query option factories for search. */
export const searchQueries = {
  /** Hybrid search results (most common use case). */
  results: (query: string, filters?: Record<string, unknown>) =>
    queryOptions({
      queryKey: queryKeys.search.results(query, filters),
      queryFn: () => searchApi.hybridSearch({ query, ...filters } as HybridSearchInput),
      enabled: !!query,
    }),
};
