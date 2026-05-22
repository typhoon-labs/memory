import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { PrefillErrorHandler } from '@mastra/core/processors';
import { createChatModel, createGuardrailModel } from '@typhoon/ai';

import { createInputGuardrails } from './guardrails/input';
import { createOutputGuardrails } from './guardrails/output';
import { createKnowledgeAgent } from './knowledge';
import { createKnowledgeSearchTool } from './tools/knowledge-search';
import { setThreadTitle } from './tools/set-thread-title';

const BASE_INSTRUCTIONS = `You are Typhoon, an AI-powered customer service supervisor.
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
- Before a tool call, write one short conversational sentence telling the user what you're about to do (e.g. "Let me look that up for you."). Keep it under ~15 words.`;

const THREAD_TITLE_INSTRUCTIONS = `

Thread title:
- On the FIRST user message in a new conversation, call setThreadTitle alongside your searchKnowledge call. Pass the user's full message.
- Do not call setThreadTitle on follow-up messages — only the first message.
- Do not narrate the setThreadTitle call.`;

export interface GuardrailsConfig {
  promptInjection?: boolean;
  moderation?: boolean;
  piiDetection?: boolean;
  systemPromptScrubbing?: boolean;
}

export interface SupervisorOptions {
  /** Pass `false` to skip all guardrails (e.g. for experiments). */
  guardrails?: GuardrailsConfig | false;
  /** Async function that returns current metadata field names and values (cached with TTL). */
  getMetadataContext?: () => Promise<string | undefined>;
  /** Include setThreadTitle tool and thread-title instructions. Default: `true`. */
  threadTitle?: boolean;
}

export function createSupervisor(
  supervisorMemory?: MastraMemory,
  guardrailsOrOptions?: GuardrailsConfig | SupervisorOptions,
) {
  // Support both old signature (GuardrailsConfig) and new (SupervisorOptions)
  const isSupervisorOptions = (v: unknown): v is SupervisorOptions =>
    typeof v === 'object' && v !== null && ('guardrails' in v || 'getMetadataContext' in v || 'threadTitle' in v);
  const options: SupervisorOptions = isSupervisorOptions(guardrailsOrOptions)
    ? guardrailsOrOptions
    : { guardrails: guardrailsOrOptions };

  const includeThreadTitle = options.threadTitle !== false;
  const skipGuardrails = options.guardrails === false;

  const knowledgeAgent = createKnowledgeAgent({ rerank: false });
  const searchKnowledge = createKnowledgeSearchTool(knowledgeAgent, {
    getMetadataContext: options.getMetadataContext,
  });

  const instructions = includeThreadTitle ? BASE_INSTRUCTIONS + THREAD_TITLE_INSTRUCTIONS : BASE_INSTRUCTIONS;

  const model = createChatModel();
  const defaultOptions = { modelSettings: { temperature: 0 } };

  // Build guardrail processors (skipped entirely when guardrails === false)
  const guardrailModel = skipGuardrails ? undefined : createGuardrailModel();
  const guardrailsConfig = skipGuardrails ? undefined : (options.guardrails as GuardrailsConfig | undefined);
  const inputProcessors = guardrailModel ? createInputGuardrails(guardrailModel, guardrailsConfig) : undefined;
  const outputProcessors = guardrailModel ? createOutputGuardrails(guardrailModel, guardrailsConfig) : undefined;
  const errorProcessors = skipGuardrails ? undefined : [new PrefillErrorHandler()];

  if (includeThreadTitle) {
    return new Agent({
      id: 'typhoon-supervisor',
      name: 'Typhoon Supervisor',
      model,
      instructions,
      tools: { searchKnowledge, setThreadTitle },
      memory: supervisorMemory,
      inputProcessors,
      outputProcessors,
      errorProcessors,
      defaultOptions,
    });
  }

  return new Agent({
    id: 'typhoon-supervisor',
    name: 'Typhoon Supervisor',
    model,
    instructions,
    tools: { searchKnowledge },
    memory: supervisorMemory,
    inputProcessors,
    outputProcessors,
    errorProcessors,
    defaultOptions,
  });
}
