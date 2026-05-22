import { apiFetch } from '../client';
import type { HybridSearchInput, SearchResponse, VectorSearchInput } from './search.types';

/** Low-level search API calls. */
export const searchApi = {
  /** Vector-only search. */
  vectorSearch: (data: VectorSearchInput) =>
    apiFetch<SearchResponse>('/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Hybrid (vector + keyword) search. */
  hybridSearch: (data: HybridSearchInput) =>
    apiFetch<SearchResponse>('/api/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
