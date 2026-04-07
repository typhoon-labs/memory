import { createGraphRAGTool } from '@mastra/rag';
import { createEmbeddingModel, EMBEDDING_DIMENSION } from '@typhoon/ai';

// biome-ignore lint/suspicious/noExplicitAny: RagTool type uses internal path not portable across packages
export const searchKnowledgeBaseGraph: any = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'knowledge_base',
  model: createEmbeddingModel(),
  enableFilter: true,
  description:
    'Search the knowledge base using graph-based retrieval to find relationships between documents. Use this tool when the question asks about connections, comparisons, or relationships across multiple topics or documents.',
  graphOptions: {
    dimension: EMBEDDING_DIMENSION,
    threshold: 0.7,
  },
});
