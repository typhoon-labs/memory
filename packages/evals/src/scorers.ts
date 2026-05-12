import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createContextPrecisionScorer,
  createContextRelevanceScorerLLM,
  createFaithfulnessScorer,
  createHallucinationScorer,
} from '@mastra/evals/scorers/prebuilt';

/**
 * Creates the standard set of RAG scorers for evaluating knowledge agent quality.
 *
 * Scorers:
 * - **faithfulness** — Are answers grounded in retrieved context?
 * - **hallucination** — Is the agent fabricating information?
 * - **answerRelevancy** — Does the answer address the question?
 * - **contextRelevance** — Are retrieved chunks relevant to the query?
 * - **contextPrecision** — Is all retrieved context actually needed?
 */
export function createRagScorers(model: MastraModelConfig) {
  const faithfulness = createFaithfulnessScorer({ model });
  const hallucination = createHallucinationScorer({ model });
  const answerRelevancy = createAnswerRelevancyScorer({ model });
  const contextRelevance = createContextRelevanceScorerLLM({ model, options: {} });
  const contextPrecision = createContextPrecisionScorer({ model, options: {} });

  return { faithfulness, hallucination, answerRelevancy, contextRelevance, contextPrecision };
}
