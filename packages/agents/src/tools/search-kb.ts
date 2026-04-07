import type { MastraLanguageModel } from '@mastra/core/agent';
import { createVectorQueryTool } from '@mastra/rag';
import { createEmbeddingModel, createRerankerModel } from '@typhoon/ai';

// biome-ignore lint/suspicious/noExplicitAny: RerankConfig types MastraLanguageModel narrowly but Agent constructor accepts LanguageModelV3 at runtime
const rerankerModel = createRerankerModel() as any as MastraLanguageModel;

// biome-ignore lint/suspicious/noExplicitAny: RagTool type uses internal path not portable across packages
export const searchKnowledgeBase: any = createVectorQueryTool({
  vectorStoreName: 'pgVector',
  indexName: 'knowledge_base',
  model: createEmbeddingModel(),
  enableFilter: true,
  description:
    'Search the knowledge base for relevant document chunks. Use this tool to find answers to customer questions from ingested source documents.',
  reranker: {
    model: rerankerModel,
    options: {
      weights: { semantic: 0.5, vector: 0.3, position: 0.2 },
      topK: 5,
    },
  },
  databaseConfig: {
    pgvector: {
      minScore: 0.6,
    },
  },
});
