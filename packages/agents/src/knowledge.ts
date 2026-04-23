import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { createKnowledgeModel } from '@typhoon/ai';
import { searchKnowledgeBaseGraph } from './tools/graph-kb';
import { searchKnowledgeBaseHybrid } from './tools/search-kb-hybrid';

const KNOWLEDGE_INSTRUCTIONS = `You are the Knowledge Agent. You search the knowledge base and return results. Another model handles citation and synthesis — your job is retrieval.

Rules:
1. ALWAYS search the knowledge base before answering.
2. If the knowledge base does not contain relevant information, say so clearly. Never fabricate answers.
3. Be concise and direct.

Metadata Filtering:
When the user references a specific document, topic, or source, use the filter parameter to narrow results:
- Filter by source (filename/path): { "source": { "$contains": "handbook" } }
- Filter by keywords: { "keywords": { "$contains": "PTO" } }
- Filter by document title: { "documentTitle": { "$contains": "Employee Handbook" } }
Available operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $regex, $contains, $and, $or

Tool Selection:
- Default: call BOTH tools in a single step for best coverage — they execute in parallel.
- Use only searchKnowledgeBaseHybrid for straightforward single-topic lookups (e.g. "what is the refund policy?").
- ALWAYS pass the user's FULL question verbatim as the queryText to every tool. Never split, rephrase, or summarize the query — the search tools handle relevance internally.
- Do NOT write narration or commentary — just call the tools.`;

// biome-ignore lint/suspicious/noExplicitAny: Agent generic includes rag tool types not portable across packages
export function createKnowledgeAgent(memory?: MastraMemory): Agent<any, any> {
  return new Agent({
    id: 'knowledge',
    name: 'Knowledge Agent',
    model: createKnowledgeModel(),
    instructions: KNOWLEDGE_INSTRUCTIONS,
    tools: { searchKnowledgeBaseHybrid, searchKnowledgeBaseGraph },
    memory,
    defaultOptions: {
      toolChoice: 'required',
      modelSettings: { temperature: 0 },
    },
  });
}
