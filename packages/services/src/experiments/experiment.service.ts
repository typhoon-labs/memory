import type { DrizzleDatasetsStorage, DrizzleExperimentsStorage } from '@typhoon/db/drivers/pg';
import { computeCategoryAverages } from '@typhoon/evals';
import type { Queue } from 'bullmq';

import type { Result } from '../types';

/** Subset of Mastra DatasetRecord fields accessed by this service. */
interface DatasetFields {
  id: string;
  version: number;
}

/** Subset of Mastra Experiment fields accessed by this service. */
interface ExperimentFields {
  id: string;
  status: string;
  datasetId: string | null;
}

export interface ExperimentServiceDeps {
  experimentsStorage: DrizzleExperimentsStorage;
  datasetsStorage: DrizzleDatasetsStorage;
  experimentQueue: Queue;
}

/** Extract response quality average from experiment result output JSONB (primary metric). */
function extractAvgScore(result: Record<string, unknown> | null): number | null {
  if (!result?.output) return null;
  const output = result.output as Record<string, unknown>;
  const scores = output.scores as Array<{ scorerId: string; score: number | null }> | undefined;
  if (!scores || scores.length === 0) return null;
  return computeCategoryAverages(scores).responseAvg;
}

export class ExperimentService {
  constructor(private deps: ExperimentServiceDeps) {}

  /** List experiments with optional status filter. */
  async list(opts: { page?: number; perPage?: number; status?: string }): Promise<Result<unknown>> {
    const page = opts.page ?? 0;
    const perPage = Math.min(opts.perPage ?? 100, 100);
    const result = await this.deps.experimentsStorage.listExperiments({ page, perPage, status: opts.status });
    return { data: result };
  }

  /** Get a single experiment by ID. */
  async getById(id: string): Promise<Result<unknown>> {
    const experiment = await this.deps.experimentsStorage.getExperimentById({ id });
    if (!experiment) return { error: 'not-found' };
    return { data: experiment };
  }

  /** Create an experiment and enqueue its job. */
  async create(input: {
    datasetId: string;
    name?: string | null;
    description?: string | null;
    metadata?: unknown;
  }): Promise<Result<unknown>> {
    if (!input.datasetId) {
      return { error: 'validation-failed', details: 'datasetId is required' };
    }

    // Validate dataset exists and count items
    const dataset = await this.deps.datasetsStorage.getDatasetById({ id: input.datasetId });
    if (!dataset) return { error: 'dataset-not-found' };

    const version = (dataset as unknown as DatasetFields).version ?? 0;
    const itemsResult = await this.deps.datasetsStorage.listItems({ datasetId: input.datasetId, page: 0, perPage: 1 });
    const totalItems = (itemsResult as unknown as { total: number }).total ?? 0;

    if (totalItems === 0) {
      return { error: 'validation-failed', details: 'Dataset has no items' };
    }

    const experiment = await this.deps.experimentsStorage.createExperiment({
      name: input.name ?? `Experiment ${new Date().toISOString().slice(0, 19)}`,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
      datasetId: input.datasetId,
      datasetVersion: version,
      targetType: 'agent',
      targetId: 'typhoon-supervisor',
      status: 'pending',
      totalItems,
    });

    // Enqueue BullMQ job
    try {
      await this.deps.experimentQueue.add('experiment-setup', {
        experimentId: (experiment as unknown as ExperimentFields).id,
      });
    } catch {
      // Queue might not be initialized in test environments
    }

    return { data: { ...(experiment as object), _status: 201 as const } };
  }

  /** Delete or cancel an experiment. */
  async delete(id: string): Promise<Result<{ ok: true; cancelled?: boolean }>> {
    const experiment = await this.deps.experimentsStorage.getExperimentById({ id });
    if (!experiment) return { error: 'not-found' };

    const status = (experiment as unknown as ExperimentFields).status;

    if (status === 'running') {
      // Signal cancellation — worker checks status before each item
      await this.deps.experimentsStorage.updateExperiment({ id, status: 'failed' });
      return { data: { ok: true, cancelled: true } };
    }

    // For pending/completed/failed: full delete
    await this.deps.experimentsStorage.deleteExperiment({ id });
    return { data: { ok: true } };
  }

  /** Get experiment results. */
  async getResults(experimentId: string, opts: { page?: number; perPage?: number }): Promise<Result<unknown>> {
    const page = opts.page ?? 0;
    const perPage = Math.min(opts.perPage ?? 100, 100);
    const result = await this.deps.experimentsStorage.listExperimentResults({ experimentId, page, perPage });
    return { data: result };
  }

  /** Compare two experiments on the same dataset. */
  async compare(idA: string, idB: string): Promise<Result<unknown>> {
    if (!idA || !idB) {
      return { error: 'validation-failed', details: 'Both experiment IDs are required' };
    }

    const [expA, expB] = await Promise.all([
      this.deps.experimentsStorage.getExperimentById({ id: idA }),
      this.deps.experimentsStorage.getExperimentById({ id: idB }),
    ]);

    if (!expA) return { error: 'not-found', details: `Experiment ${idA} not found` };
    if (!expB) return { error: 'not-found', details: `Experiment ${idB} not found` };

    const datasetA = (expA as unknown as ExperimentFields).datasetId;
    const datasetB = (expB as unknown as ExperimentFields).datasetId;
    if (datasetA !== datasetB) {
      return { error: 'validation-failed', details: 'Experiments must share the same dataset for comparison' };
    }

    // Load results for both experiments
    const [resultsA, resultsB] = await Promise.all([
      this.deps.experimentsStorage.listExperimentResults({ experimentId: idA, page: 0, perPage: 1000 }),
      this.deps.experimentsStorage.listExperimentResults({ experimentId: idB, page: 0, perPage: 1000 }),
    ]);

    const itemsA = (resultsA as unknown as { results: Array<Record<string, unknown>> }).results;
    const itemsB = (resultsB as unknown as { results: Array<Record<string, unknown>> }).results;

    // Index by itemId for comparison
    const mapA = new Map(itemsA.map((r) => [r.itemId as string, r]));
    const mapB = new Map(itemsB.map((r) => [r.itemId as string, r]));
    const allItemIds = new Set([...mapA.keys(), ...mapB.keys()]);

    let totalScoreA = 0;
    let totalScoreB = 0;
    let scoredCountA = 0;
    let scoredCountB = 0;
    let regressionCount = 0;
    let improvementCount = 0;

    const items: Array<{
      itemId: string;
      input: unknown;
      resultA: Record<string, unknown> | null;
      resultB: Record<string, unknown> | null;
      scoreDelta: number | null;
    }> = [];

    for (const itemId of allItemIds) {
      const rA = mapA.get(itemId) ?? null;
      const rB = mapB.get(itemId) ?? null;

      const scoreA = extractAvgScore(rA);
      const scoreB = extractAvgScore(rB);

      if (scoreA !== null) {
        totalScoreA += scoreA;
        scoredCountA++;
      }
      if (scoreB !== null) {
        totalScoreB += scoreB;
        scoredCountB++;
      }

      let scoreDelta: number | null = null;
      if (scoreA !== null && scoreB !== null) {
        scoreDelta = scoreB - scoreA;
        if (scoreDelta < -0.01) regressionCount++;
        if (scoreDelta > 0.01) improvementCount++;
      }

      items.push({
        itemId,
        input: rA?.input ?? rB?.input ?? null,
        resultA: rA,
        resultB: rB,
        scoreDelta,
      });
    }

    return {
      data: {
        experimentA: expA,
        experimentB: expB,
        aggregate: {
          avgScoreA: scoredCountA > 0 ? totalScoreA / scoredCountA : null,
          avgScoreB: scoredCountB > 0 ? totalScoreB / scoredCountB : null,
          delta: scoredCountA > 0 && scoredCountB > 0 ? totalScoreB / scoredCountB - totalScoreA / scoredCountA : null,
          regressionCount,
          improvementCount,
        },
        items,
      },
    };
  }
}
