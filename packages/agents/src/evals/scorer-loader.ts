import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createContextPrecisionScorer,
  createContextRelevanceScorerLLM,
  createFaithfulnessScorer,
  createHallucinationScorer,
} from '@mastra/evals/scorers/prebuilt';
import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('scorer-loader');

/**
 * Scorer definition version data as loaded from the database.
 * Represents the configuration needed to construct a Mastra scorer at runtime.
 */
export interface ScorerDefinitionVersion {
  /** Scorer definition ID — used as the scorer ID for score persistence. */
  id: string;
  /** Human-readable name (e.g. "faithfulness", "tone-checker"). */
  name: string;
  /** Scorer type — a prebuilt name or "custom" for LLM-as-judge. */
  type: string;
  /** Description of what this scorer evaluates. */
  description: string | null;
  /** Model config override (unused for prebuilt types). */
  model: Record<string, unknown> | null;
  /** LLM-as-judge instructions (used for custom type only). */
  instructions: string | null;
  /** Score range config. */
  scoreRange: { min: number; max: number; step?: number } | null;
  /** Preset-specific configuration. */
  presetConfig: Record<string, unknown> | null;
  /** Sampling strategy. */
  defaultSampling: Record<string, unknown> | null;
}

/** Prebuilt scorer types that map to Mastra's built-in factories. */
const PREBUILT_TYPES = new Set([
  'faithfulness',
  'hallucination',
  'answerRelevancy',
  'contextRelevance',
  'contextPrecision',
]);

/** Context-dependent prebuilt scorers that require non-empty context. */
const CONTEXT_DEPENDENT = new Set(['faithfulness', 'hallucination', 'contextRelevance', 'contextPrecision']);

/**
 * Construct a Mastra scorer from a database definition version.
 *
 * For prebuilt types, delegates to the corresponding factory from `@mastra/evals/scorers/prebuilt`.
 * Context-dependent scorers return `null` when context is empty (same behavior as the
 * original hardcoded `createScorerEntries()`).
 *
 * For custom types, creates an LLM-as-judge scorer using `createScorer()` from Mastra.
 *
 * @returns `{ id, scorer }` or `null` if the scorer cannot be constructed.
 */
export function constructScorer(
  definition: ScorerDefinitionVersion,
  model: MastraModelConfig,
  context: string[],
  // biome-ignore lint/suspicious/noExplicitAny: Scorer generics vary between prebuilt scorer types
): { id: string; scorer: any } | null {
  const { type, name } = definition;
  const id = name;

  if (CONTEXT_DEPENDENT.has(type) && context.length === 0) {
    return null;
  }

  if (PREBUILT_TYPES.has(type)) {
    return constructPrebuiltScorer(type, id, model, context);
  }

  if (type === 'custom') {
    return constructCustomScorer(definition, model);
  }

  log.warn('Unknown scorer type, skipping', { type, name });
  return null;
}

function constructPrebuiltScorer(
  type: string,
  id: string,
  model: MastraModelConfig,
  context: string[],
  // biome-ignore lint/suspicious/noExplicitAny: Scorer generics vary between prebuilt scorer types
): { id: string; scorer: any } | null {
  switch (type) {
    case 'faithfulness':
      return { id, scorer: createFaithfulnessScorer({ model, options: { context } }) };
    case 'hallucination':
      return { id, scorer: createHallucinationScorer({ model, options: { context } }) };
    case 'answerRelevancy':
      return { id, scorer: createAnswerRelevancyScorer({ model }) };
    case 'contextRelevance':
      return { id, scorer: createContextRelevanceScorerLLM({ model, options: { context } }) };
    case 'contextPrecision':
      return { id, scorer: createContextPrecisionScorer({ model, options: { context } }) };
    default:
      return null;
  }
}

function constructCustomScorer(
  definition: ScorerDefinitionVersion,
  model: MastraModelConfig,
  // biome-ignore lint/suspicious/noExplicitAny: Scorer generics vary between prebuilt scorer types
): { id: string; scorer: any } | null {
  if (!definition.instructions) {
    log.warn('Custom scorer missing instructions, skipping', { name: definition.name });
    return null;
  }

  // Dynamic import to avoid bundling @mastra/core/evals in the agents package at module level.
  // createScorer is re-exported from @mastra/core/evals.
  const { createScorer } = require('@mastra/core/evals') as {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic import of Mastra createScorer
    createScorer: (config: any) => any;
  };

  const scorer = createScorer({
    id: definition.name,
    description: definition.description ?? `Custom scorer: ${definition.name}`,
    type: 'agent',
    judge: {
      model,
      instructions: definition.instructions,
    },
  })
    .generateScore({
      description: `Evaluate using custom criteria: ${definition.name}`,
      createPrompt: ({ run }: { run: { input: unknown; output: unknown } }) => {
        return [
          'You are evaluating an AI agent response. Score it from 0 to 1 based on the criteria below.',
          '',
          `Criteria: ${definition.instructions}`,
          '',
          `User Input: ${JSON.stringify(run.input)}`,
          '',
          `Agent Response: ${JSON.stringify(run.output)}`,
          '',
          'Respond with ONLY a number between 0 and 1.',
        ].join('\n');
      },
    })
    .generateReason({
      description: 'Explain the score',
      createPrompt: ({ run, score }: { run: { input: unknown; output: unknown }; score: number }) => {
        return [
          `The agent response received a score of ${score} based on the following criteria:`,
          `Criteria: ${definition.instructions}`,
          '',
          `User Input: ${JSON.stringify(run.input)}`,
          `Agent Response: ${JSON.stringify(run.output)}`,
          '',
          'Explain why this score was given in 1-2 sentences.',
        ].join('\n');
      },
    });

  return { id: definition.name, scorer };
}

/**
 * SQL query to fetch all published scorer definitions with their active versions.
 * Used by both the worker (periodic refresh) and the API (preview route).
 *
 * Callers provide their own `sql` instance and map the raw rows using `mapScorerRows()`.
 */
export const PUBLISHED_SCORERS_QUERY = `
  SELECT
    d.id,
    v.name,
    v.type,
    v.description,
    v.model,
    v.instructions,
    v.score_range,
    v.preset_config,
    v.default_sampling
  FROM scorer_definitions d
  JOIN scorer_definition_versions v ON v.id = d.active_version_id
  WHERE d.status = 'active'
  ORDER BY v.name ASC
`;

/** Map raw SQL rows to `ScorerDefinitionVersion` objects. */
export function mapScorerRows(rows: Array<Record<string, unknown>>): ScorerDefinitionVersion[] {
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as string,
    description: (r.description as string) ?? null,
    model: (r.model as Record<string, unknown>) ?? null,
    instructions: (r.instructions as string) ?? null,
    scoreRange: (r.score_range as { min: number; max: number; step?: number }) ?? null,
    presetConfig: (r.preset_config as Record<string, unknown>) ?? null,
    defaultSampling: (r.default_sampling as Record<string, unknown>) ?? null,
  }));
}
