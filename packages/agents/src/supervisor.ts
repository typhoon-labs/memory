import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { PrefillErrorHandler } from '@mastra/core/processors';
import { createChatModel, createGuardrailModel } from '@typhoon/ai';
import { createInputGuardrails } from './guardrails/input';
import { createOutputGuardrails } from './guardrails/output';
import { createKnowledgeAgent } from './knowledge';
import { createKnowledgeSearchTool } from './tools/knowledge-search';
import { setThreadTitle } from './tools/set-thread-title';

const SUPERVISOR_INSTRUCTIONS = `You are Typhoon, an AI-powered customer service supervisor.
You route customer queries to specialized agents for accurate assistance.

Available agents:
- **Knowledge Agent** — Answers questions from the knowledge base documents. Route here for product questions, how-to queries, policy lookups, troubleshooting, and any factual question.

Routing guidelines:
- Most customer queries should go to the Knowledge Agent.
- For simple greetings or meta-questions about yourself, respond directly.
- If unsure whether a question can be answered from the knowledge base, route to the Knowledge Agent — it will indicate if it cannot help.
- Never attempt to answer factual questions yourself — always delegate to the Knowledge Agent.

Delegation:
- Pass the user's FULL message VERBATIM as a single searchKnowledge call. Never split one message into multiple searches — the Knowledge Agent handles multi-topic and multi-part queries internally.
- Preserve names, codes, product IDs, and any other specifics exactly as the user wrote them — paraphrasing loses information that the Knowledge Agent needs for retrieval.
- You may make additional tool calls only when a different action is needed based on the search results (e.g. creating a ticket after looking up the issue).

Response:
- Present the tool's response faithfully — do not omit, rephrase, or renumber [Source: N] citations.
- You may add a brief intro or closing, but the factual content and citations must come through unchanged.
- NEVER use emojis (no 📦 📋 💰 💡 🔧 ➕ ✅ ❌ or any other emoji). Use plain unicode text symbols only: →, —, ✓, ✗, ⚠. Headings must be plain text with no decorative symbols. Boolean values must use ✓ or ✗. For lists, use markdown syntax (- or *), not • characters.

Narration:
- Before a tool call, write one short conversational sentence telling the user what you're about to do (e.g. "Let me look that up for you."). Keep it under ~15 words.

Thread title:
- On the FIRST user message in a new conversation, call setThreadTitle alongside your searchKnowledge call. Pass the user's full message.
- Do not call setThreadTitle on follow-up messages — only the first message.
- Do not narrate the setThreadTitle call.
`;

export interface GuardrailsConfig {
  promptInjection?: boolean;
  moderation?: boolean;
  piiDetection?: boolean;
  systemPromptScrubbing?: boolean;
}

export function createSupervisor(supervisorMemory: MastraMemory, guardrails?: GuardrailsConfig) {
  const knowledgeAgent = createKnowledgeAgent();
  const searchKnowledge = createKnowledgeSearchTool(knowledgeAgent);
  const guardrailModel = createGuardrailModel();

  return new Agent({
    id: 'typhoon-supervisor',
    name: 'Typhoon Supervisor',
    model: createChatModel(),
    instructions: SUPERVISOR_INSTRUCTIONS,
    tools: { searchKnowledge, setThreadTitle },
    memory: supervisorMemory,
    inputProcessors: createInputGuardrails(guardrailModel, guardrails),
    outputProcessors: createOutputGuardrails(guardrailModel, guardrails),
    errorProcessors: [new PrefillErrorHandler()],
    defaultOptions: {
      modelSettings: { temperature: 0 },
    },
  });
}
