import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { createKnowledgeModel } from '@typhoon/ai';

import { searchKnowledgeBaseGraph } from './tools/graph-kb';
import { createHybridSearchTool, searchKnowledgeBaseHybrid } from './tools/search-kb-hybrid';

const KNOWLEDGE_INSTRUCTIONS = `You are the Knowledge Agent. You search the knowledge base and return results. Another model handles citation and synthesis — your job is retrieval.

Rules:
1. ALWAYS search the knowledge base before answering.
2. If the knowledge base does not contain relevant information, say so clearly. Never fabricate answers.
3. Be concise and direct.

Metadata Filtering:
When the user references a specific document, topic, source, or category, use the filter parameter to narrow results:
- Filter by source (filename/path): { "source": { "$contains": "handbook" } }
- Filter by keywords: { "keywords": { "$contains": "PTO" } }
- Filter by document title: { "title": { "$contains": "Employee Handbook" } }
- Filter by custom metadata: { "field": "value" }, { "field": { "$in": ["val1", "val2"] } }
- Combine filters: { "$and": [{ "field1": "val1" }, { "field2": "val2" }] }
Available operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $regex, $contains, $and, $or

When the user mentions a metadata dimension (region, product, category, etc.), apply relevant filters using the available metadata fields listed in the conversation context.
When a metadata field has a default value (e.g., a catch-all category), include both the specific value and the default in an $in filter to avoid excluding general-purpose documents.
Use the available metadata fields (if provided) for exact field names and allowed values.

Tool Selection:
- Default: call BOTH tools in a single step for best coverage — they execute in parallel.
- Use only searchKnowledgeBaseHybrid for straightforward single-topic lookups (e.g. "what is the refund policy?").
- ALWAYS pass the user's FULL question verbatim as the queryText to every tool. Never split, rephrase, or summarize the query — the search tools handle relevance internally.
- Do NOT write narration or commentary — just call the tools.`;

export interface KnowledgeAgentOptions {
  memory?: MastraMemory;
  /**
   * Whether sub-tools should rerank individually. Default: true.
   *
   * Set to false when the caller (e.g. composite searchKnowledge tool) will
   * rerank the merged result set — avoids double-reranking and lets
   * sub-tools return broad, un-reranked candidates.
   */
  rerank?: boolean;
}

// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Agent generic includes rag tool types not portable across packages
export function createKnowledgeAgent(options?: KnowledgeAgentOptions): Agent<any, any> {
  const rerank = options?.rerank ?? true;
  const hybridTool = rerank ? searchKnowledgeBaseHybrid : createHybridSearchTool({ rerank: false });

  return new Agent({
    id: 'knowledge',
    name: 'Knowledge Agent',
    model: createKnowledgeModel(),
    instructions: KNOWLEDGE_INSTRUCTIONS,
    tools: { searchKnowledgeBaseHybrid: hybridTool, searchKnowledgeBaseGraph },
    memory: options?.memory,
    defaultOptions: {
      toolChoice: 'required',
      modelSettings: { temperature: 0 },
    },
  });
}
