import type { MastraLanguageModel } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { rerank } from '@mastra/rag';
import { createEmbeddingModel, createRerankerModel, EMBEDDING_MAX_CHARS } from '@typhoon/ai';
import { refineResults } from '@typhoon/db/drivers/pg';
import { embed } from 'ai';
import { z } from 'zod';
import { emitToolProgress } from './with-progress';

// biome-ignore lint/suspicious/noExplicitAny: RerankConfig types MastraLanguageModel narrowly but Agent constructor accepts LanguageModelV3 at runtime
const rerankerModel = createRerankerModel() as any as MastraLanguageModel;

export const searchKnowledgeBaseHybrid = createTool({
  id: 'search_knowledge_base_hybrid',
  description:
    'Search the knowledge base for relevant document chunks using keyword matching and semantic similarity with reranking. Use this tool to find answers to customer questions from ingested source documents.',
  inputSchema: z.object({
    queryText: z.string().max(EMBEDDING_MAX_CHARS).describe('The search query text'),
    topK: z.number().int().min(1).max(50).default(15).describe('Number of results to return'),
  }),
  execute: async ({ queryText, topK }, context) => {
    const mastra = context?.mastra;
    if (!mastra) throw new Error('Mastra context required for hybrid search');

    const vectorStore = mastra.getVector('pgVector');
    if (!vectorStore || !('hybridQuery' in vectorStore)) {
      throw new Error('pgVector store with hybridQuery not available');
    }

    await emitToolProgress(context, 'Embedding query for hybrid search…');

    const { embedding } = await embed({
      model: createEmbeddingModel(),
      value: queryText,
    });

    await emitToolProgress(context, `Running hybrid keyword + vector search (topK=${String(topK)})…`);

    // biome-ignore lint/suspicious/noExplicitAny: hybridQuery is not on MastraVector base class
    const results = await (vectorStore as any).hybridQuery({
      indexName: 'knowledge_base',
      queryText,
      queryVector: embedding,
      topK,
    });

    if (results.length === 0) {
      await emitToolProgress(context, 'No matching chunks found.', 'done');
      return { sources: [] };
    }

    await emitToolProgress(context, `Reranking ${String(results.length)} chunks…`);

    const refined = await refineResults(results, queryText, {
      minScore: 0.25,
      dedupKey: 'chunkId',
      reranker: (r, q) =>
        rerank(r, q, rerankerModel, {
          weights: { semantic: 0.5, vector: 0.3, position: 0.2 },
          topK: Math.min(topK ?? 15, 10),
        }),
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
    };
  },
});
