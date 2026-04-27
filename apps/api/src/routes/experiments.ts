import { registerApiRoute } from '@mastra/core/server';
import { DrizzleDatasetsStorage, DrizzleExperimentsStorage } from '@typhoon/db/drivers/pg';
import { db } from '../db';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getQueue } from '../queue';

const datasetsStorage = new DrizzleDatasetsStorage(db);
const experimentsStorage = new DrizzleExperimentsStorage(db);

export const experimentRoutes = [
  // List experiments
  registerApiRoute('/v1/admin/experiments', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const page = Number(c.req.query('page') ?? '0');
      const perPage = Math.min(Number(c.req.query('perPage') ?? '100'), 100);
      const status = c.req.query('status');
      const result = await experimentsStorage.listExperiments({ page, perPage, status });
      return c.json(result);
    },
  }),

  // Create experiment and enqueue job
  registerApiRoute('/v1/admin/experiments', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const { datasetId, name, description, metadata } = body;

      if (!datasetId) {
        return c.json({ error: 'datasetId is required' }, 400);
      }

      // Validate dataset exists and count items
      const dataset = await datasetsStorage.getDatasetById({ id: datasetId });
      if (!dataset) return c.json({ error: 'Dataset not found' }, 404);

      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const version = (dataset as any).version ?? 0;
      const itemsResult = await datasetsStorage.listItems({ datasetId, page: 0, perPage: 1 });
      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const totalItems = (itemsResult as any).total ?? 0;

      if (totalItems === 0) {
        return c.json({ error: 'Dataset has no items' }, 400);
      }

      const experiment = await experimentsStorage.createExperiment({
        name: name ?? `Experiment ${new Date().toISOString().slice(0, 19)}`,
        description: description ?? null,
        metadata: metadata ?? null,
        datasetId,
        datasetVersion: version,
        targetType: 'agent',
        targetId: 'typhoon-supervisor',
        status: 'pending',
        totalItems,
      });

      // Enqueue BullMQ job
      try {
        const queue = getQueue('experiments');
        // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
        await queue.add('run-experiment', { experimentId: (experiment as any).id });
      } catch {
        // Queue might not be initialized in test environments
      }

      return c.json(experiment, 201);
    },
  }),

  // Compare two experiments — must be before /:id routes to avoid path conflict
  registerApiRoute('/v1/admin/experiments/compare', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const idA = c.req.query('a');
      const idB = c.req.query('b');

      if (!idA || !idB) {
        return c.json({ error: 'Both query params "a" and "b" (experiment IDs) are required' }, 400);
      }

      const [expA, expB] = await Promise.all([
        experimentsStorage.getExperimentById({ id: idA }),
        experimentsStorage.getExperimentById({ id: idB }),
      ]);

      if (!expA) return c.json({ error: `Experiment ${idA} not found` }, 404);
      if (!expB) return c.json({ error: `Experiment ${idB} not found` }, 404);

      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const datasetA = (expA as any).dataset_id;
      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const datasetB = (expB as any).dataset_id;
      if (datasetA !== datasetB) {
        return c.json({ error: 'Experiments must share the same dataset for comparison' }, 400);
      }

      // Load results for both experiments
      const [resultsA, resultsB] = await Promise.all([
        experimentsStorage.listExperimentResults({ experimentId: idA, page: 0, perPage: 1000 }),
        experimentsStorage.listExperimentResults({ experimentId: idB, page: 0, perPage: 1000 }),
      ]);

      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const itemsA = (resultsA as any).results as Array<Record<string, unknown>>;
      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const itemsB = (resultsB as any).results as Array<Record<string, unknown>>;

      // Index by item_id for comparison
      const mapA = new Map(itemsA.map((r) => [r.item_id as string, r]));
      const mapB = new Map(itemsB.map((r) => [r.item_id as string, r]));
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

      return c.json({
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
      });
    },
  }),

  // Get experiment by ID
  registerApiRoute('/v1/admin/experiments/:id', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const experiment = await experimentsStorage.getExperimentById({ id });
      if (!experiment) return c.json({ error: 'Experiment not found' }, 404);
      return c.json(experiment);
    },
  }),

  // Cancel or delete experiment
  registerApiRoute('/v1/admin/experiments/:id', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const experiment = await experimentsStorage.getExperimentById({ id });
      if (!experiment) return c.json({ error: 'Experiment not found' }, 404);

      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const status = (experiment as any).status;

      if (status === 'running') {
        // Signal cancellation — worker checks status before each item
        await experimentsStorage.updateExperiment({ id, status: 'failed' });
        return c.json({ ok: true, cancelled: true });
      }

      // For pending/completed/failed: full delete
      await experimentsStorage.deleteExperiment({ id });
      return c.json({ ok: true });
    },
  }),

  // Get experiment results
  registerApiRoute('/v1/admin/experiments/:id/results', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const experimentId = c.req.param('id');
      const page = Number(c.req.query('page') ?? '0');
      const perPage = Math.min(Number(c.req.query('perPage') ?? '100'), 100);
      const result = await experimentsStorage.listExperimentResults({ experimentId, page, perPage });
      return c.json(result);
    },
  }),
];

/** Extract average score from experiment result output JSONB. */
function extractAvgScore(result: Record<string, unknown> | null): number | null {
  if (!result?.output) return null;
  const output = result.output as Record<string, unknown>;
  const scores = output.scores as Array<{ score: number }> | undefined;
  if (!scores || scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
}
