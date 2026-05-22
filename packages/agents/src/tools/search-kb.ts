import { createVectorQueryTool } from '@mastra/rag';
import {
  createEmbeddingModel,
  createRerankerScorer,
  RAG_RERANK_CANDIDATES,
  RAG_RERANK_WEIGHTS,
  RAG_VECTOR_MIN_SCORE_AGENT,
} from '@typhoon/ai';

import { withProgress } from './with-progress';

export interface VectorSearchToolOptions {
  /** Whether to rerank results with the Cohere cross-encoder. Default: true. */
  rerank?: boolean;
}

/**
 * Factory that creates a vector-only search tool.
 *
 * When `rerank` is true (default) the tool passes a reranker config to
 * Mastra's createVectorQueryTool, which inflates retrieval internally and
 * returns the top results after reranking. When false, no reranker is
 * configured and raw vector similarity results are returned.
 */
export function createVectorSearchTool(options?: VectorSearchToolOptions) {
  const shouldRerank = options?.rerank ?? true;
  const rerankerScorer = shouldRerank ? createRerankerScorer() : undefined;

  const inner = createVectorQueryTool({
    vectorStoreName: 'pgVector',
    indexName: 'knowledge_base',
    model: createEmbeddingModel(),
    enableFilter: true,
    description:
      'Search the knowledge base for relevant document chunks. Use this tool to find answers to customer questions from ingested source documents.',
    reranker:
      shouldRerank && rerankerScorer
        ? {
            model: rerankerScorer,
            options: {
              weights: RAG_RERANK_WEIGHTS,
              topK: RAG_RERANK_CANDIDATES,
            },
          }
        : undefined,
    databaseConfig: {
      pgvector: {
        minScore: RAG_VECTOR_MIN_SCORE_AGENT,
      },
    },
  });

  return withProgress(inner, {
    start: 'Embedding query and searching the knowledge base…',
    done: (output) => {
      const count = Array.isArray(output) ? output.length : 0;
      return count > 0 ? `Returned ${count} chunks.` : 'No matching chunks found.';
    },
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- RagTool type uses internal path not portable across packages
  }) as any;
}

/** Default vector search tool with reranking enabled (standalone use). */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- RagTool type uses internal path not portable across packages
export const searchKnowledgeBase: any = createVectorSearchTool({ rerank: true });
