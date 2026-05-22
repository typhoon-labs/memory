import { Mastra } from '@mastra/core';
import { createSupervisor } from '@typhoon/agents';
import { DrizzleDatasetsStorage, DrizzleExperimentsStorage } from '@typhoon/db/drivers/pg';
import { ExperimentRepo } from '@typhoon/db/repos';
import {
  BUILTIN_SCORER_DEFS,
  completeExperiment,
  processExperimentItemStep1,
  processExperimentItemStep2,
  setupExperiment,
} from '@typhoon/evals';
import { createAppLogger } from '@typhoon/logger';
import type {
  ExperimentCompleteJobData,
  ExperimentItemJobData,
  ExperimentJobData,
  ScoringRunJobData,
} from '@typhoon/queue';
import { WaitingChildrenError } from 'bullmq';
import type { Worker } from 'bullmq';

import type { ExperimentsWorkerDeps } from './types';

const log = createAppLogger('worker');

/**
 * Creates the BullMQ Worker for the 'experiments' queue.
 * Handles experiment-setup, exp-item-process (2-step), and experiment-complete jobs.
 */
export function createExperimentsWorker(deps: ExperimentsWorkerDeps): Worker {
  const {
    redis,
    db,
    vectorStore,
    createScoringModel,
    flowProducer,
    scoringQueue,
    refreshScorerDefinitions,
    getCachedScorerDefs,
  } = deps;

  const datasetsStorage = new DrizzleDatasetsStorage(db);
  const experimentsStorage = new DrizzleExperimentsStorage(db);
  const experimentRepo = new ExperimentRepo(db);
  const experimentAgent = createSupervisor(undefined, { guardrails: false, threadTitle: false });

  const experimentMastra = new Mastra({
    agents: { 'typhoon-supervisor': experimentAgent },
    vectors: { pgVector: vectorStore },
    logger: log,
  });
  const registeredAgent = experimentMastra.getAgent('typhoon-supervisor');

  const experimentDeps = {
    getExperiment: async (id: string) => experimentRepo.findById(id),
    updateExperiment: async (input: Record<string, unknown>) => {
      await experimentsStorage.updateExperiment(input);
    },
    getDatasetItems: async (datasetId: string, version: number) => {
      const rows = await datasetsStorage.getItemsByVersion({ datasetId, version });
      return rows as { id: string; input: Record<string, unknown>; groundTruth?: Record<string, unknown> | null }[];
    },
    addExperimentResult: async (input: Record<string, unknown>) => {
      await experimentsStorage.addExperimentResult(input);
    },
    hydrateChunks: async (chunkIds: string[]) => {
      if (chunkIds.length === 0) return new Map();
      const rows = await vectorStore.getChunksByIds('knowledge_base', chunkIds);
      const syncTargetIds = new Set<string>();
      for (const r of rows) {
        const stId = r.metadata?.syncTargetId as string | undefined;
        if (stId) syncTargetIds.add(stId);
      }
      const syncTargetNames =
        syncTargetIds.size > 0 ? await vectorStore.getSyncTargetNames([...syncTargetIds]) : new Map<string, string>();
      return new Map(
        rows.map((r) => [
          r.id,
          {
            text: (r.metadata?.text as string) ?? undefined,
            title: (r.metadata?.title as string) ?? undefined,
            source: (r.metadata?.source as string) ?? undefined,
            section: (r.metadata?.section as string) ?? undefined,
            syncTargetName: syncTargetNames.get(r.metadata?.syncTargetId as string) ?? undefined,
          },
        ]),
      );
    },
  };

  const experimentsConcurrency = Number(process.env.EXPERIMENTS_CONCURRENCY ?? '3');

  const experimentWorker = redis.createWorker(
    'experiments',
    async (job, token) => {
      switch (job.name) {
        case 'experiment-setup': {
          const { experimentId } = job.data as ExperimentJobData;
          await refreshScorerDefinitions();

          const { items } = await setupExperiment(experimentId, experimentDeps);
          if (items.length === 0) {
            return { succeeded: 0, failed: 0, cancelled: false };
          }

          await flowProducer.add({
            name: 'experiment-complete',
            queueName: 'experiments',
            data: {
              experimentId,
              totalItems: items.length,
            } satisfies ExperimentCompleteJobData,
            children: items.map((item) => ({
              name: 'exp-item-process',
              queueName: 'experiments',
              data: {
                experimentId,
                itemId: item.id,
                input: item.input,
                groundTruth: item.groundTruth ?? null,
                step: 1,
              } satisfies ExperimentItemJobData,
              opts: { ignoreDependencyOnFailure: true },
            })),
          });

          return { itemsEnqueued: items.length };
        }

        case 'exp-item-process': {
          const data = job.data as ExperimentItemJobData;
          const step = data.step ?? 1;

          if (step === 1) {
            // Step 1: call agent, add score-run children, wait
            await refreshScorerDefinitions();
            const cachedDefs = getCachedScorerDefs();
            const scorerDefs = cachedDefs.length > 0 ? cachedDefs : BUILTIN_SCORER_DEFS;

            const result = await processExperimentItemStep1(
              { id: data.itemId, input: data.input, groundTruth: data.groundTruth },
              data.experimentId,
              registeredAgent,
              createScoringModel,
              scorerDefs,
              { getExperiment: experimentDeps.getExperiment, hydrateChunks: experimentDeps.hydrateChunks },
            );

            if (!result) {
              // Cancelled
              return { itemId: data.itemId, succeeded: false, scorersFailed: 0 };
            }

            // Add score-run children dynamically
            for (const def of result.applicableScorers) {
              // oxlint-disable-next-line no-await-in-loop -- sequential: enqueue child jobs with parent dependency
              await scoringQueue.add(
                'score-run',
                {
                  scorerName: def.name,
                  scorerDefinition: def,
                  userQuestion: result.question,
                  responseText: result.scorerResponseText,
                  context: result.context,
                } satisfies ScoringRunJobData,
                {
                  parent: { id: job.id ?? '', queue: job.queueQualifiedName },
                  ignoreDependencyOnFailure: true,
                  priority: 5,
                },
              );
            }

            // Persist state for step 2 (including skipped retrieval scorers)
            await job.updateData({
              ...data,
              step: 2,
              responseText: result.responseText,
              contextSkippedScorerNames: result.contextSkippedScorers.map((d) => d.name),
              chunkSources: result.chunkSources.map(({ text: _text, ...rest }) => rest),
            });

            // Wait for children
            const shouldWait = await job.moveToWaitingChildren(token ?? '');
            if (shouldWait) {
              throw new WaitingChildrenError();
            }
            // Fall through to step 2 if no children to wait for
          }

          // Step 2: collect scores and save result
          const updatedData = job.data as ExperimentItemJobData;
          const childrenValues = await job.getChildrenValues();
          const ignoredFailures = await job.getFailedChildrenValues();

          const step2Result = await processExperimentItemStep2(
            updatedData.experimentId,
            updatedData.itemId,
            updatedData.input,
            updatedData.groundTruth,
            updatedData.responseText ?? '',
            childrenValues as Record<string, { scorerId: string; score: number; reason: string }>,
            ignoredFailures as Record<string, string>,
            updatedData.contextSkippedScorerNames ?? [],
            {
              addExperimentResult: experimentDeps.addExperimentResult,
              updateExperiment: experimentDeps.updateExperiment,
            },
            new Date(),
            updatedData.chunkSources as import('@typhoon/evals').ChunkSource[] | undefined,
          );

          // Atomic counter increment for progress tracking
          if (step2Result.succeeded) {
            await experimentRepo.incrementSucceeded(updatedData.experimentId);
          } else {
            await experimentRepo.incrementFailed(updatedData.experimentId);
          }

          return { itemId: updatedData.itemId, ...step2Result };
        }

        case 'experiment-complete': {
          const data = job.data as ExperimentCompleteJobData;
          const childrenValues = await job.getChildrenValues();
          const ignoredFailures = await job.getFailedChildrenValues();

          return await completeExperiment(
            data.experimentId,
            childrenValues as Record<string, { itemId: string; succeeded: boolean; scorersFailed: number }>,
            ignoredFailures as Record<string, string>,
            { updateExperiment: experimentDeps.updateExperiment },
          );
        }

        default:
          throw new Error(`Unknown experiments job type: ${job.name}`);
      }
    },
    {
      concurrency: experimentsConcurrency,
      lockDuration: 10 * 60 * 1000,
      stalledInterval: 5 * 60 * 1000,
      maxStalledCount: 1,
    },
  );

  experimentWorker.on('error', (err) => {
    log.error('Experiment worker error', { error: err.message });
  });
  experimentWorker.on('failed', (job, err) => {
    log.error('Experiment job failed', { jobId: job?.id, name: job?.name, error: err.message });
  });
  experimentWorker.on('completed', (job) => {
    log.debug('Experiment job completed', { jobId: job.id, name: job.name, result: job.returnvalue });
  });

  log.info('Experiment worker started', { concurrency: experimentsConcurrency });

  return experimentWorker;
}
