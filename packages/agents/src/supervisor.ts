import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { createChatModel } from '@typhoon/ai';
import { createKnowledgeAgent } from './knowledge.js';

const SUPERVISOR_INSTRUCTIONS = `You are Typhoon, an AI-powered customer service supervisor.
You route customer queries to specialized agents for accurate assistance.

Available agents:
- **Knowledge Agent** — Answers questions from the knowledge base documents. Route here for product questions, how-to queries, policy lookups, troubleshooting, and any factual question.

Routing guidelines:
- Most customer queries should go to the Knowledge Agent.
- For simple greetings or meta-questions about yourself, respond directly.
- If unsure whether a question can be answered from the knowledge base, route to the Knowledge Agent — it will indicate if it cannot help.
- Never attempt to answer factual questions yourself — always delegate to the Knowledge Agent.`;

export function createSupervisor(agentMemory: MastraMemory, supervisorMemory: MastraMemory) {
  const knowledgeAgent = createKnowledgeAgent(agentMemory);

  return new Agent({
    id: 'typhoon-supervisor',
    name: 'Typhoon Supervisor',
    model: createChatModel(),
    instructions: SUPERVISOR_INSTRUCTIONS,
    agents: { knowledgeAgent },
    memory: supervisorMemory,
  });
}
