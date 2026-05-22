/** Payload for POST /v1/search (vector search). */
export interface VectorSearchInput {
  query: string;
  topK?: number;
  minScore?: number;
  rerank?: boolean;
}

/** Payload for POST /v1/search/hybrid. */
export interface HybridSearchInput {
  query: string;
  topK?: number;
  minScore?: number;
  dedup?: boolean;
  rerank?: boolean;
  expanded?: boolean;
}

/** A single search result chunk. */
export interface SearchResult {
  text: string;
  score: number;
  documentId: string;
  metadata: Record<string, unknown>;
}

/** Response from search endpoints. */
export interface SearchResponse {
  results: SearchResult[];
}
