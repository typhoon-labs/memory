import type { PgVector, RerankFn } from '@typhoon/db/drivers/pg';
import { refineResults } from '@typhoon/db/drivers/pg';

import type { Result } from '../types';

/** Minimal tracer interface matching what we use from OTel Tracer. */
export interface SearchTracer {
  startActiveSpan: <T>(name: string, fn: (span: TracerSpan) => Promise<T>) => Promise<T>;
}

interface TracerSpan {
  setAttribute: (key: string, value: string | number | boolean) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  end: () => void;
}

export interface SearchServiceDeps {
  vectorStore: PgVector;
  tracer: SearchTracer;
  createEmbedding: (text: string) => Promise<number[]>;
  createReranker: (topK: number) => RerankFn;
  getRerankerMetrics: (query: string) => { topScore?: number; durationMs?: number } | null;
  config: {
    rerankCandidates: number;
    rerankCandidatesExpanded: number;
    rerankMinScore: number;
    vectorMinScore: number;
  };
}

export interface SearchResult {
  text: string;
  score: number;
  metadata: {
    documentId: unknown;
    syncTargetId: unknown;
    source: unknown;
    title: unknown;
    startIndex: unknown;
  };
}

export interface VectorSearchInput {
  query: string;
  topK: number;
  minScore: number;
  rerank: boolean;
}

export interface HybridSearchInput {
  query: string;
  topK?: number;
  minScore?: number;
  dedup: boolean;
  rerank: boolean;
  expanded: boolean;
}

export interface SearchOutput {
  results: SearchResult[];
  rerank?: { topScore?: number; durationMs?: number } | null;
}

/** Maps raw vector results to the standardized search response shape. */
function mapResults(results: Array<{ score: number; metadata?: unknown }>): SearchResult[] {
  return results.map((r) => ({
    text: ((r.metadata as Record<string, unknown>)?.text as string) ?? '',
    score: r.score,
    metadata: {
      documentId: (r.metadata as Record<string, unknown>)?.documentId,
      syncTargetId: (r.metadata as Record<string, unknown>)?.syncTargetId,
      source: (r.metadata as Record<string, unknown>)?.source,
      title: (r.metadata as Record<string, unknown>)?.title,
      startIndex: (r.metadata as Record<string, unknown>)?.startIndex ?? null,
    },
  }));
}

export class SearchService {
  constructor(private deps: SearchServiceDeps) {}

  /** Perform a vector-only search with optional reranking. */
  async vectorSearch(input: VectorSearchInput): Promise<Result<SearchOutput>> {
    const { query, topK, minScore, rerank: shouldRerank } = input;
    const { vectorStore, tracer, createEmbedding, createReranker, getRerankerMetrics, config } = this.deps;

    try {
      const embedding = await createEmbedding(query);

      const retrievalK = shouldRerank ? Math.max(config.rerankCandidates, topK) : topK;

      const queryResults = await vectorStore.query({
        indexName: 'knowledge_base',
        queryVector: embedding,
        topK: retrievalK,
        minScore: shouldRerank ? undefined : minScore,
      });

      if (shouldRerank) {
        const { result: refined, metrics } = await tracer.startActiveSpan('rag rerank: vector', async (span) => {
          span.setAttribute('rag.candidates', queryResults.length);
          span.setAttribute('rag.topK', topK);
          try {
            const result = await refineResults(queryResults, query, {
              minScore: minScore ?? config.rerankMinScore,
              reranker: createReranker(topK),
            });
            const m = getRerankerMetrics(query);
            span.setAttribute('rag.refined_count', result.length);
            if (m?.topScore !== null && m?.topScore !== undefined) span.setAttribute('rag.top_score', m.topScore);
            if (m?.durationMs !== null && m?.durationMs !== undefined)
              span.setAttribute('rag.duration_ms', m.durationMs);
            span.setStatus({ code: 0 });
            span.end();
            return { result, metrics: m };
          } catch (err) {
            span.setStatus({ code: 2, message: String(err) });
            span.end();
            throw err;
          }
        });

        return { data: { results: mapResults(refined), rerank: metrics } };
      }

      return { data: { results: mapResults(queryResults) } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { error: message };
    }
  }

  /** Perform a hybrid (vector + full-text) search with optional reranking and deduplication. */
  async hybridSearch(input: HybridSearchInput): Promise<Result<SearchOutput>> {
    const { query, topK, minScore, dedup, rerank: shouldRerank, expanded } = input;
    const { vectorStore, tracer, createEmbedding, createReranker, getRerankerMetrics, config } = this.deps;

    try {
      const embedding = await createEmbedding(query);

      const candidates = expanded ? config.rerankCandidatesExpanded : config.rerankCandidates;
      const effectiveTopK = topK ?? candidates;

      // Inflate retrieval when reranking for a broad candidate pool
      const retrievalK = shouldRerank ? Math.max(candidates, effectiveTopK) : effectiveTopK;

      const queryResults = await vectorStore.hybridQuery({
        indexName: 'knowledge_base',
        queryText: query,
        queryVector: embedding,
        topK: retrievalK,
      });

      const refined = shouldRerank
        ? await tracer.startActiveSpan('rag rerank: hybrid', async (span) => {
            span.setAttribute('rag.candidates', queryResults.length);
            span.setAttribute('rag.topK', effectiveTopK);
            span.setAttribute('rag.expanded', expanded);
            try {
              const result = await refineResults(queryResults, query, {
                minScore: minScore ?? config.rerankMinScore,
                dedupKey: dedup ? (expanded ? 'chunkId' : 'documentId') : undefined,
                reranker: createReranker(effectiveTopK),
              });
              const metrics = getRerankerMetrics(query);
              span.setAttribute('rag.refined_count', result.length);
              if (metrics?.topScore !== null && metrics?.topScore !== undefined)
                span.setAttribute('rag.top_score', metrics.topScore);
              if (metrics?.durationMs !== null && metrics?.durationMs !== undefined)
                span.setAttribute('rag.duration_ms', metrics.durationMs);
              span.setStatus({ code: 0 });
              span.end();
              return { result, metrics };
            } catch (err) {
              span.setStatus({ code: 2, message: String(err) });
              span.end();
              throw err;
            }
          })
        : {
            result: await refineResults(queryResults, query, {
              minScore: minScore ?? undefined,
              dedupKey: dedup ? (expanded ? 'chunkId' : 'documentId') : undefined,
              reranker: undefined,
            }),
            metrics: undefined,
          };

      return { data: { results: mapResults(refined.result), rerank: refined.metrics } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return { error: message };
    }
  }
}
