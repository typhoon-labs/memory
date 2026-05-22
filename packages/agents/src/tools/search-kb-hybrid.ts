import { createObservabilityContext, SpanType } from '@mastra/core/observability';
import { createTool } from '@mastra/core/tools';
import { rerankWithScorer } from '@mastra/rag';
import {
  createEmbeddingModel,
  createRerankerScorer,
  EMBEDDING_MAX_CHARS,
  RAG_RERANK_CANDIDATES,
  RAG_RERANK_MIN_SCORE,
  RAG_RERANK_WEIGHTS,
} from '@typhoon/ai';
import { refineResults } from '@typhoon/db/drivers/pg';
import { embed, type EmbeddingModel } from 'ai';
import { z } from 'zod';

import { emitToolProgress } from './with-progress';

export interface HybridSearchToolOptions {
  /** Whether to rerank results with the Cohere cross-encoder. Default: true. */
  rerank?: boolean;
}

/**
 * Factory that creates a hybrid (keyword + vector) search tool.
 *
 * When `rerank` is true (default) the tool inflates retrieval to
 * `RAG_RERANK_CANDIDATES`, reranks the full candidate pool, and returns
 * the top `topK` results. When false it returns raw RRF-scored results
 * for downstream reranking (e.g. in the composite knowledge search tool).
 */
export function createHybridSearchTool(options?: HybridSearchToolOptions) {
  const shouldRerank = options?.rerank ?? true;
  const rerankerScorer = shouldRerank ? createRerankerScorer() : undefined;

  return createTool({
    id: 'search_knowledge_base_hybrid',
    description:
      'Search the knowledge base for relevant document chunks using keyword matching and semantic similarity with reranking. Use this tool to find answers to customer questions from ingested source documents.',
    inputSchema: z.object({
      queryText: z.string().max(EMBEDDING_MAX_CHARS).describe('The search query text'),
      topK: z.number().int().min(1).max(100).default(15).describe('Number of results to return'),
      filter: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'MongoDB-style metadata filter to scope results. Examples: { "field": "value" }, { "field": { "$in": ["val1", "val2"] } }, { "$and": [{ "field1": "val1" }, { "field2": "val2" }] }',
        ),
    }),
    execute: async ({ queryText, topK, filter }, context) => {
      const mastra = context?.mastra;
      if (!mastra) throw new Error('Mastra context required for hybrid search');

      const vectorStore = mastra.getVector('pgVector');
      if (!vectorStore || !('hybridQuery' in vectorStore)) {
        throw new Error('pgVector store with hybridQuery not available');
      }

      const obsContext = createObservabilityContext(context?.tracingContext);
      const parentSpan = obsContext.tracingContext?.currentSpan;

      await emitToolProgress(context, 'Embedding query for hybrid search…');

      const embedSpan = parentSpan?.createChildSpan({
        type: SpanType.RAG_EMBEDDING,
        name: 'rag embed: query',
        input: queryText,
        attributes: { mode: 'query' },
      });
      const { embedding } = await embed({
        model: createEmbeddingModel() as unknown as EmbeddingModel,
        value: queryText,
      });
      embedSpan?.end({ output: { dimensions: embedding.length } });

      // Inflate retrieval depth so the reranker gets a broad candidate pool.
      const effectiveTopK = topK ?? 15;
      const retrievalK = Math.max(RAG_RERANK_CANDIDATES, effectiveTopK);

      await emitToolProgress(context, `Running hybrid keyword + vector search (topK=${String(retrievalK)})…`);

      const querySpan = parentSpan?.createChildSpan({
        type: SpanType.RAG_VECTOR_OPERATION,
        name: 'rag vector: hybrid query',
        input: { queryText, topK: retrievalK, filter: filter ?? null },
        attributes: { operation: 'query', indexName: 'knowledge_base' },
      });
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- hybridQuery is not on MastraVector base class
      const results = await (vectorStore as any).hybridQuery({
        indexName: 'knowledge_base',
        queryText,
        queryVector: embedding,
        topK: retrievalK,
        filter: filter ?? undefined,
      });
      querySpan?.end({ output: { resultCount: results.length } });

      if (results.length === 0) {
        await emitToolProgress(context, 'No matching chunks found.', 'done');
        return { sources: [] };
      }

      if (!shouldRerank || !rerankerScorer) {
        await emitToolProgress(context, `Returned ${String(results.length)} chunks (no rerank).`, 'done');
        return {
          sources: results.map((r: { id: string; metadata: Record<string, unknown>; score: number }) => ({
            id: r.id,
            metadata: r.metadata,
            score: r.score,
            document: (r.metadata as Record<string, unknown>)?.text ?? '',
            vector: [],
          })),
        };
      }

      await emitToolProgress(context, `Reranking ${String(results.length)} chunks…`);

      const rerankSpan = parentSpan?.createChildSpan({
        type: SpanType.RAG_ACTION,
        name: 'rag rerank',
        input: { candidateCount: results.length },
        attributes: { action: 'rerank' } as never,
      });

      const refined = await refineResults(results, queryText, {
        minScore: RAG_RERANK_MIN_SCORE,
        dedupKey: 'chunkId',
        reranker: (r, q) =>
          rerankWithScorer({
            results: r,
            query: q,
            scorer: rerankerScorer,
            options: {
              weights: RAG_RERANK_WEIGHTS,
              topK: effectiveTopK,
            },
          }),
      });

      const metrics = rerankerScorer.getMetrics(queryText);
      rerankSpan?.end({
        output: {
          refinedCount: refined.length,
          topScore: metrics?.topScore,
          durationMs: metrics?.durationMs,
        },
      });

      await emitToolProgress(context, `Returned ${String(refined.length)} reranked chunks.`, 'done');

      return {
        sources: refined.map((r) => ({
          id: r.id,
          metadata: r.metadata,
          score: r.score,
          document: (r.metadata as Record<string, unknown>)?.text ?? '',
          vector: [],
        })),
        rerank: metrics,
      };
    },
  });
}

/** Default hybrid search tool with reranking enabled (standalone use). */
export const searchKnowledgeBaseHybrid = createHybridSearchTool({ rerank: true });
