import type { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createAppLogger } from '@typhoon/logger';
import { RETRIEVAL_SCORERS } from './scorer-categories';
import { constructScorer, type ScorerDefinitionVersion } from './scorer-loader';

const log = createAppLogger('experiment');

// ── Types ───────────────────────────────────────────────────────────

export interface ExperimentDeps {
  getExperiment: (id: string) => Promise<ExperimentRecord | null>;
  updateExperiment: (input: Record<string, unknown>) => Promise<void>;
  getDatasetItems: (datasetId: string, version: number) => Promise<DatasetItem[]>;
  addExperimentResult: (input: Record<string, unknown>) => Promise<void>;
  /** Optional — called after each item to extend BullMQ lock. */
  extendLock?: () => Promise<void>;
}

export interface ExperimentRecord {
  id: string;
  status: string;
  dataset_id: string;
  dataset_version: number;
  total_items: number;
}

export interface DatasetItem {
  id: string;
  input: Record<string, unknown>;
  groundTruth?: Record<string, unknown> | null;
  requestContext?: Record<string, unknown> | null;
}

export interface ExperimentResult {
  succeeded: number;
  failed: number;
  cancelled: boolean;
}

interface ScorerResult {
  scorerId: string;
  score: number | null;
  reason: string;
  status?: 'skipped';
}

/** Return current timestamp as a Date for Drizzle timestamp columns. */
function isoNow(): Date {
  return new Date();
}

/**
 * Extract RAG context chunks from agent response steps.
 *
 * The experiment agent uses `searchKnowledge` which returns `_chunkSources`
 * in tool results. Each chunk source has a `text` field with the retrieved
 * document text that context-dependent scorers need.
 */
export function extractContextFromSteps(steps: Array<Record<string, unknown>> | undefined): string[] {
  if (!steps) return [];
  const context: string[] = [];
  for (const step of steps) {
    for (const tr of (step.toolResults as Array<Record<string, unknown>>) ?? []) {
      const payload = tr.payload as Record<string, unknown> | undefined;
      const result = (payload?.result ?? tr.result) as Record<string, unknown> | undefined;
      if (!result || !Array.isArray(result._chunkSources)) continue;
      for (const cs of result._chunkSources as Record<string, unknown>[]) {
        if (typeof cs.text === 'string' && cs.text) context.push(cs.text);
      }
    }
  }
  return context;
}

// ── setupExperiment ─────────────────────────────────────────────────

/**
 * Setup phase for experiment execution: validate experiment, load dataset items.
 *
 * Called by the experiment-setup job handler. Returns the experiment record and
 * dataset items for the worker to create the outer BullMQ Flow.
 *
 * @throws Error with `unrecoverable: true` for permanent failures.
 */
export async function setupExperiment(
  experimentId: string,
  deps: Pick<ExperimentDeps, 'getExperiment' | 'updateExperiment' | 'getDatasetItems'>,
): Promise<{ experiment: ExperimentRecord; items: DatasetItem[] }> {
  log.info('Loading experiment', { experimentId });
  const experiment = await deps.getExperiment(experimentId);
  if (!experiment) {
    throw Object.assign(new Error(`Experiment not found: ${experimentId}`), { unrecoverable: true });
  }
  if (experiment.status !== 'pending') {
    throw Object.assign(new Error(`Experiment ${experimentId} is ${experiment.status}, expected pending`), {
      unrecoverable: true,
    });
  }

  await deps.updateExperiment({ id: experimentId, status: 'running', startedAt: isoNow() });
  log.info('Experiment started', { experimentId, totalItems: experiment.total_items });

  const items = await deps.getDatasetItems(experiment.dataset_id, experiment.dataset_version);
  log.info('Dataset items loaded', { experimentId, count: items.length });

  if (items.length === 0) {
    await deps.updateExperiment({ id: experimentId, status: 'completed', completedAt: isoNow() });
    log.info('Experiment completed (no items)', { experimentId });
  }

  return { experiment, items };
}

// ── processExperimentItem ───────────────────────────────────────────

/**
 * Step 1 of experiment item processing: call agent and determine applicable scorers.
 *
 * Called by the exp-item-process job handler in step 1. The worker uses the
 * returned data to add score-run child jobs to the scoring queue, then calls
 * `moveToWaitingChildren()`.
 */
export async function processExperimentItemStep1(
  item: DatasetItem,
  experimentId: string,
  agent: Agent,
  model: MastraModelConfig,
  scorerDefinitions: ScorerDefinitionVersion[],
  deps: Pick<ExperimentDeps, 'getExperiment'>,
): Promise<{
  cancelled: boolean;
  question: string;
  responseText: string;
  context: string[];
  applicableScorers: ScorerDefinitionVersion[];
  contextSkippedScorers: ScorerDefinitionVersion[];
} | null> {
  // Check for cancellation before processing
  const current = await deps.getExperiment(experimentId);
  if (!current || current.status === 'failed') {
    log.info('Experiment cancelled, skipping item', { experimentId, itemId: item.id });
    return null;
  }

  // Extract question from input
  const question =
    typeof item.input === 'string'
      ? item.input
      : ((item.input as Record<string, string>).question ?? JSON.stringify(item.input));

  // Call agent
  log.debug('Calling agent', { experimentId, itemId: item.id, question: question.slice(0, 100) });
  const response = await agent.generate([{ role: 'user', content: question }]);
  const responseText = response.text ?? '';
  log.debug('Agent responded', { experimentId, itemId: item.id, responseLength: responseText.length });

  // Extract RAG context from agent tool results
  // biome-ignore lint/suspicious/noExplicitAny: Mastra agent response steps are loosely typed
  const context = extractContextFromSteps((response as any).steps);

  // Determine applicable scorers (retrieval scorers skipped when no RAG context)
  const applicableScorers: ScorerDefinitionVersion[] = [];
  const contextSkippedScorers: ScorerDefinitionVersion[] = [];

  for (const def of scorerDefinitions) {
    const entry = constructScorer(def, model, context);
    if (entry) {
      applicableScorers.push(def);
    } else if (RETRIEVAL_SCORERS.has(def.type) && context.length === 0) {
      contextSkippedScorers.push(def);
    }
  }

  return { cancelled: false, question, responseText, context, applicableScorers, contextSkippedScorers };
}

/**
 * Step 2 of experiment item processing: collect scores from children and save result.
 *
 * Called by the exp-item-process job handler in step 2, after all score-run
 * children have completed.
 */
export async function processExperimentItemStep2(
  experimentId: string,
  itemId: string,
  input: Record<string, unknown>,
  groundTruth: Record<string, unknown> | null | undefined,
  responseText: string,
  childrenValues: Record<string, ScorerResult>,
  ignoredFailures: Record<string, string>,
  contextSkippedScorerNames: string[],
  deps: Pick<ExperimentDeps, 'addExperimentResult' | 'updateExperiment'>,
  startedAt: Date,
): Promise<{ succeeded: boolean; scorersFailed: number }> {
  const executedScores = Object.values(childrenValues);
  const skippedEntries: ScorerResult[] = contextSkippedScorerNames.map((name) => ({
    scorerId: name,
    score: null,
    reason: 'Skipped: no retrieval context',
    status: 'skipped' as const,
  }));
  const scores = [...executedScores, ...skippedEntries];
  const scorersFailed = Object.keys(ignoredFailures).length;

  if (scorersFailed > 0) {
    log.warn('Some scorers failed for experiment item', { experimentId, itemId, scorersFailed });
  }

  await deps.addExperimentResult({
    experimentId,
    itemId,
    input,
    output: { responseText, scores },
    groundTruth: groundTruth ?? null,
    startedAt,
    completedAt: isoNow(),
  });

  log.info('Experiment item scored', { experimentId, itemId, scores: scores.map((s) => s.score), scorersFailed });
  return { succeeded: true, scorersFailed };
}

// ── completeExperiment ──────────────────────────────────────────────

/**
 * Complete experiment: aggregate results from all items and set final status.
 *
 * Called by the experiment-complete job handler after all exp-item-process
 * children have resolved (BullMQ Flow guarantee).
 */
export async function completeExperiment(
  experimentId: string,
  childrenValues: Record<string, { itemId: string; succeeded: boolean; scorersFailed: number }>,
  ignoredFailures: Record<string, string>,
  deps: Pick<ExperimentDeps, 'updateExperiment'>,
): Promise<ExperimentResult> {
  const items = Object.values(childrenValues);
  const succeeded = items.filter((i) => i.succeeded).length;
  const failed = Object.keys(ignoredFailures).length;

  await deps.updateExperiment({
    id: experimentId,
    status: failed > 0 && succeeded === 0 ? 'failed' : 'completed',
    completedAt: isoNow(),
    succeededCount: succeeded,
    failedCount: failed,
  });

  log.info('Experiment finished', { experimentId, succeeded, failed });
  return { succeeded, failed, cancelled: false };
}
