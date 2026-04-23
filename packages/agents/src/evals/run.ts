import type { Agent } from '@mastra/core/agent';
import { runEvals } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createRagScorers } from './scorers';

export interface EvalInput {
  /** The user question to evaluate. */
  input: string;
}

export interface EvalResult {
  input: string;
  scores: Record<string, { score: number; reason?: string }>;
}

/**
 * Run RAG evaluation against the knowledge agent with a set of test questions.
 *
 * Returns per-question scores for faithfulness, hallucination, answer relevancy,
 * context relevance, and context precision.
 *
 * @example
 * ```ts
 * const results = await runRagEvals(knowledgeAgent, createChatModel(), [
 *   { input: 'What is the PTO policy?' },
 *   { input: 'How do I request time off?' },
 * ]);
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Agent generic varies based on tool types
export async function runRagEvals(agent: Agent<any, any>, model: MastraModelConfig, data: EvalInput[]) {
  const scorers = createRagScorers(model);
  const scorerList = Object.values(scorers);

  const results: EvalResult[] = [];

  const evalResult = await runEvals({
    data,
    scorers: scorerList,
    target: agent,
    onItemComplete: ({ item, scorerResults }) => {
      const scores: Record<string, { score: number; reason?: string }> = {};
      for (const [id, result] of Object.entries(scorerResults)) {
        scores[id] = { score: (result as { score: number }).score, reason: (result as { reason?: string }).reason };
      }
      results.push({ input: item.input as string, scores });
    },
  });

  return { results, summary: evalResult.summary };
}
