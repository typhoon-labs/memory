import type { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/prebuilt';
import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('experiment');

const CONCURRENCY = 3;

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
  ground_truth?: Record<string, unknown> | null;
  request_context?: Record<string, unknown> | null;
}

export interface ExperimentResult {
  succeeded: number;
  failed: number;
  cancelled: boolean;
}

interface ScorerResult {
  scorerId: string;
  score: number;
  reason: string;
}

/** Return current timestamp as a Date for Drizzle timestamp columns. */
function isoNow(): Date {
  return new Date();
}

/**
 * Core experiment execution logic, decoupled from BullMQ.
 *
 * Iterates all dataset items, calls the agent for each, scores the response,
 * and records results. Processes items with limited concurrency.
 */
export async function handleExperimentJob(
  experimentId: string,
  agent: Agent,
  model: MastraModelConfig,
  deps: ExperimentDeps,
): Promise<ExperimentResult> {
  // 1. Load and validate experiment
  log.info('Loading experiment', { experimentId });
  const experiment = await deps.getExperiment(experimentId);
  if (!experiment) {
    log.error('Experiment not found', { experimentId });
    throw Object.assign(new Error(`Experiment not found: ${experimentId}`), { unrecoverable: true });
  }
  if (experiment.status !== 'pending') {
    log.error('Experiment not in pending state', { experimentId, status: experiment.status });
    throw Object.assign(new Error(`Experiment ${experimentId} is ${experiment.status}, expected pending`), {
      unrecoverable: true,
    });
  }

  // 2. Update status to running
  try {
    await deps.updateExperiment({ id: experimentId, status: 'running', startedAt: isoNow() });
    log.info('Experiment started', { experimentId, totalItems: experiment.total_items });
  } catch (err) {
    log.error('Failed to update experiment status', { experimentId, error: String(err) });
    throw err;
  }

  // 3. Load dataset items
  let items: DatasetItem[];
  try {
    items = await deps.getDatasetItems(experiment.dataset_id, experiment.dataset_version);
    log.info('Dataset items loaded', { experimentId, count: items.length });
  } catch (err) {
    log.error('Failed to load dataset items', { experimentId, error: String(err) });
    await deps.updateExperiment({ id: experimentId, status: 'failed', completedAt: isoNow() });
    throw err;
  }

  if (items.length === 0) {
    await deps.updateExperiment({ id: experimentId, status: 'completed', completedAt: isoNow() });
    log.info('Experiment completed (no items)', { experimentId });
    return { succeeded: 0, failed: 0, cancelled: false };
  }

  // 4. Process items with concurrency limit
  let succeeded = 0;
  let failed = 0;
  let cancelled = false;

  const processItem = async (item: DatasetItem, index: number) => {
    // Check for cancellation before each item
    const current = await deps.getExperiment(experimentId);
    if (!current || current.status === 'failed') {
      cancelled = true;
      return;
    }

    const startedAt = isoNow();
    log.info('Processing item', { experimentId, itemId: item.id, index: index + 1, total: items.length });

    try {
      // Extract question from input JSONB
      const question =
        typeof item.input === 'string'
          ? item.input
          : ((item.input as Record<string, string>).question ?? JSON.stringify(item.input));

      // Call agent
      log.debug('Calling agent', { experimentId, itemId: item.id, question: question.slice(0, 100) });
      const response = await agent.generate([{ role: 'user', content: question }]);
      const responseText = response.text ?? '';
      log.debug('Agent responded', { experimentId, itemId: item.id, responseLength: responseText.length });

      // Run scorers
      const scores = await runScorers(question, responseText, model);

      // Save result
      await deps.addExperimentResult({
        experimentId,
        itemId: item.id,
        input: item.input,
        output: { responseText, scores },
        groundTruth: item.ground_truth ?? null,
        startedAt,
        completedAt: isoNow(),
      });

      succeeded++;
      log.info('Item succeeded', { experimentId, itemId: item.id, scores: scores.map((s) => s.score) });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('Item failed', { experimentId, itemId: item.id, error: errorMsg });

      try {
        await deps.addExperimentResult({
          experimentId,
          itemId: item.id,
          input: item.input,
          output: null,
          groundTruth: item.ground_truth ?? null,
          error: { message: errorMsg },
          startedAt,
          completedAt: isoNow(),
        });
      } catch (saveErr) {
        log.error('Failed to save error result', { experimentId, itemId: item.id, error: String(saveErr) });
      }

      failed++;
    }

    // Update counters
    try {
      await deps.updateExperiment({
        id: experimentId,
        succeededCount: succeeded,
        failedCount: failed,
      });
    } catch (err) {
      log.error('Failed to update counters', { experimentId, error: String(err) });
    }

    // Extend BullMQ lock if available
    if (deps.extendLock) {
      try {
        await deps.extendLock();
      } catch {
        // Lock extension is best-effort
      }
    }
  };

  // Process items with concurrency limit
  const queue = [...items];
  const active: Promise<void>[] = [];
  let itemIndex = 0;

  while (queue.length > 0 && !cancelled) {
    while (active.length < CONCURRENCY && queue.length > 0 && !cancelled) {
      const item = queue.shift()!;
      const idx = itemIndex++;
      const promise = processItem(item, idx).then(() => {
        active.splice(active.indexOf(promise), 1);
      });
      active.push(promise);
    }
    if (active.length > 0) {
      await Promise.race(active);
    }
  }

  // Wait for remaining active items
  if (active.length > 0) {
    await Promise.allSettled(active);
  }

  // 5. Update final status
  try {
    await deps.updateExperiment({
      id: experimentId,
      status: cancelled ? 'failed' : 'completed',
      completedAt: isoNow(),
      succeededCount: succeeded,
      failedCount: failed,
    });
  } catch (err) {
    log.error('Failed to update final status', { experimentId, error: String(err) });
  }

  log.info('Experiment finished', { experimentId, succeeded, failed, cancelled });
  return { succeeded, failed, cancelled };
}

/**
 * Run all applicable scorers against a response.
 * Returns scores without persisting — caller stores in experiment_results.output.
 */
async function runScorers(question: string, responseText: string, model: MastraModelConfig): Promise<ScorerResult[]> {
  // biome-ignore lint/suspicious/noExplicitAny: Scorer generics vary between prebuilt scorer types
  const scorerEntries: Array<{ id: string; scorer: any }> = [
    { id: 'answerRelevancy', scorer: createAnswerRelevancyScorer({ model }) },
  ];

  const scorerInput = {
    inputMessages: [{ role: 'user' as const, content: { content: question } }],
    rememberedMessages: [],
    systemMessages: [],
    taggedSystemMessages: {},
  };
  const scorerOutput = [{ role: 'assistant' as const, content: { content: responseText } }];

  const results: ScorerResult[] = [];
  for (const { id: scorerId, scorer } of scorerEntries) {
    try {
      const result = await scorer.run({ input: scorerInput, output: scorerOutput });
      results.push({ scorerId, score: result.score, reason: result.reason ?? '' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Scorer failed in experiment', { scorerId, error: msg });
      results.push({ scorerId, score: 0, reason: `Error: ${msg}` });
    }
  }

  return results;
}
