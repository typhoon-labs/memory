import { createTool } from '@mastra/core/tools';
import { createEmbeddingModel } from '@typhoon/ai';
import { embed } from 'ai';
import { z } from 'zod';

export const searchKnowledgeBaseHybrid = createTool({
  id: 'search_knowledge_base_hybrid',
  description:
    'Search the knowledge base using both keyword matching and semantic similarity. Use this tool when the query contains specific terms, names, codes, or acronyms where exact keyword matching is important alongside meaning.',
  inputSchema: z.object({
    queryText: z.string().describe('The search query text'),
    topK: z.number().int().min(1).max(50).default(10).describe('Number of results to return'),
  }),
  execute: async ({ queryText, topK }, context) => {
    const mastra = context?.mastra;
    if (!mastra) throw new Error('Mastra context required for hybrid search');

    const vectorStore = mastra.getVector('pgVector');
    if (!vectorStore || !('hybridQuery' in vectorStore)) {
      throw new Error('pgVector store with hybridQuery not available');
    }

    const { embedding } = await embed({
      model: createEmbeddingModel(),
      value: queryText,
    });

    // biome-ignore lint/suspicious/noExplicitAny: hybridQuery is not on MastraVector base class
    const results = await (vectorStore as any).hybridQuery({
      indexName: 'knowledge_base',
      queryText,
      queryVector: embedding,
      topK,
    });

    const contextParts = results.map(
      (r: { metadata?: Record<string, unknown>; score: number }) => (r.metadata?.text as string) ?? '',
    );

    return {
      relevantContext: contextParts.join('\n\n---\n\n'),
      sources: results.map((r: { id: string; metadata?: Record<string, unknown>; score: number }) => ({
        id: r.id,
        metadata: r.metadata,
        score: r.score,
        document: (r.metadata?.text as string) ?? '',
        vector: [],
      })),
    };
  },
});
