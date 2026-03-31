import { createVectorQueryTool } from '@mastra/rag';
import { createEmbeddingModel } from '@typhoon/ai';

export const searchKnowledgeBase = createVectorQueryTool({
  vectorStoreName: 'pgVector',
  indexName: 'knowledge_base',
  model: createEmbeddingModel(),
  description:
    'Search the knowledge base for relevant document chunks. Use this tool to find answers to customer questions from ingested source documents.',
});
