import type { QueryResult } from '@mastra/core/vector';

/**
 * Callback type for LLM-based reranking.
 * The caller binds model + options; this layer stays model-agnostic.
 */
export type RerankFn = (
  results: QueryResult[],
  query: string,
) => Promise<Array<{ result: QueryResult; score: number }>>;

export interface RefineOptions {
  /** Discard results with score below this threshold. */
  minScore?: number;
  /** Metadata field to deduplicate on (keeps highest-scoring entry per key). */
  dedupKey?: string;
  /** Optional reranker callback — caller binds model + options. */
  reranker?: RerankFn;
}

/**
 * Post-process raw vector/hybrid search results through an optional pipeline:
 *   1. Dedup by metadata key  (cheap — shrinks reranker input)
 *   2. Rerank  (expensive LLM call — runs on smallest candidate set)
 *   3. minScore filter  (applied last — reranked scores are normalized 0-1,
 *      raw RRF scores are much smaller so filtering before rerank would
 *      incorrectly discard everything)
 *
 * Each stage is independently optional. With no options the input is returned as-is.
 */
export async function refineResults(
  results: QueryResult[],
  query: string,
  options: RefineOptions = {},
): Promise<QueryResult[]> {
  let refined = results;

  // 1. Dedup by metadata key (keep highest score)
  if (options.dedupKey) {
    const key = options.dedupKey;
    const map = new Map<string, QueryResult>();
    for (const r of refined) {
      const val = (r.metadata as Record<string, unknown> | undefined)?.[key] as string | undefined;
      if (!val) {
        // No dedup key on this result — keep it keyed by id
        map.set(r.id, r);
        continue;
      }
      const existing = map.get(val);
      if (!existing || r.score > existing.score) {
        map.set(val, r);
      }
    }
    refined = [...map.values()];
  }

  // 2. Rerank (optional — caller binds model + options)
  if (options.reranker) {
    const reranked = await options.reranker(refined, query);
    refined = reranked.map((r) => Object.assign({}, r.result, { score: r.score }));
  }

  // 3. Filter by minScore (applied after rerank so scores are normalized)
  if (options.minScore !== null && options.minScore !== undefined && options.minScore > 0) {
    const threshold = options.minScore;
    refined = refined.filter((r) => r.score >= threshold);
  }

  return refined;
}
