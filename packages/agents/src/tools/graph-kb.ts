import { createGraphRAGTool } from '@mastra/rag';
import { createEmbeddingModel, EMBEDDING_DIMENSION, RAG_GRAPH_THRESHOLD } from '@typhoon/ai';

import { withProgress } from './with-progress';

const inner = createGraphRAGTool({
  vectorStoreName: 'pgVector',
  indexName: 'knowledge_base',
  model: createEmbeddingModel(),
  enableFilter: true,
  description:
    'Search the knowledge base using graph-based retrieval to find relationships between documents. Use this tool when the question asks about connections, comparisons, or relationships across multiple topics or documents.',
  graphOptions: {
    dimension: EMBEDDING_DIMENSION,
    threshold: RAG_GRAPH_THRESHOLD,
  },
});

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- RagTool type uses internal path not portable across packages
export const searchKnowledgeBaseGraph: any = withProgress(inner, {
  start: 'Walking the document graph for related context…',
  done: (output) => {
    const count = Array.isArray(output) ? output.length : 0;
    return count > 0 ? `Returned ${count} connected chunks.` : 'No connected chunks found.';
  },
});
