import { prepareScoring } from '@typhoon/evals';
import { createAppLogger } from '@typhoon/logger';
import type { ScoringAggregateJobData, ScoringJobData, ScoringRunJobData } from '@typhoon/queue';
import { UnrecoverableError } from 'bullmq';
import type { Worker } from 'bullmq';

import type { ReviewsWorkerDeps } from './types';

const log = createAppLogger('worker');

/**
 * Creates the BullMQ Worker for the 'reviews' queue.
 * Handles score-message and score-aggregate jobs.
 */
export function createReviewsWorker(deps: ReviewsWorkerDeps): Worker {
  const { redis, createScoringModel, scoringDeps, flowProducer, refreshScorerDefinitions, getCachedScorerDefs } = deps;

  const reviewsConcurrency = Number(process.env.SCORING_CONCURRENCY ?? '5');

  const reviewsWorker = redis.createWorker(
    'reviews',
    async (job) => {
      switch (job.name) {
        case 'score-message': {
          const data = job.data as ScoringJobData;
          try {
            await refreshScorerDefinitions();
            const cachedDefs = getCachedScorerDefs();

            const prepared = await prepareScoring(
              {
                messageId: data.messageId,
                threadId: data.threadId,
                agentId: data.agentId,
                traceId: data.traceId,
              },
              scoringDeps,
              createScoringModel,
              cachedDefs.length > 0 ? cachedDefs : undefined,
            );

            if (prepared.scorersToRun.length === 0) {
              return { scored: 0, skipped: prepared.skippedCount, errors: [] };
            }

            await flowProducer.add({
              name: 'score-aggregate',
              queueName: 'reviews',
              data: {
                messageId: prepared.messageId,
                threadId: data.threadId,
                totalScorers: prepared.scorersToRun.length + prepared.skippedCount,
                skippedScorers: prepared.skippedCount,
              } satisfies ScoringAggregateJobData,
              children: prepared.scorersToRun.map((def) => ({
                name: 'score-run',
                queueName: 'scoring',
                data: {
                  scorerName: def.name,
                  scorerDefinition: def,
                  userQuestion: prepared.userQuestion,
                  responseText: prepared.responseText,
                  context: prepared.context,
                  persist: {
                    messageId: prepared.messageId,
                    threadId: data.threadId,
                    agentId: data.agentId,
                    traceId: data.traceId,
                  },
                } satisfies ScoringRunJobData,
                opts: { ignoreDependencyOnFailure: true, priority: 1 },
              })),
            });

            return { prepared: prepared.scorersToRun.length, skipped: prepared.skippedCount };
          } catch (err) {
            if (err && typeof err === 'object' && 'unrecoverable' in err) {
              throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
            }
            throw err;
          }
        }

        case 'score-aggregate': {
          const aggData = job.data as ScoringAggregateJobData;
          const childrenValues = await job.getChildrenValues();
          const ignoredFailures = await job.getFailedChildrenValues();

          const scored = Object.keys(childrenValues).length;
          const failed = Object.keys(ignoredFailures).length;

          log.info('Scoring complete', {
            messageId: aggData.messageId,
            scored,
            skipped: aggData.skippedScorers,
            failed,
            total: aggData.totalScorers,
          });

          if (failed > 0) {
            log.warn('Partial scoring failure', {
              messageId: aggData.messageId,
              failed,
            });
          }

          return { scored, skipped: aggData.skippedScorers, failed };
        }

        default:
          throw new Error(`Unknown reviews job type: ${job.name}`);
      }
    },
    {
      concurrency: reviewsConcurrency,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 150_000,
      maxStalledCount: 2,
    },
  );

  reviewsWorker.on('error', (err) => {
    log.error('Reviews worker error', { error: err.message });
  });
  reviewsWorker.on('failed', (job, err) => {
    log.error('Reviews job failed', { jobId: job?.id, name: job?.name, error: err.message });
  });
  reviewsWorker.on('completed', (job) => {
    log.debug('Reviews job completed', { jobId: job.id, name: job.name, result: job.returnvalue });
  });

  log.info('Reviews worker started', { concurrency: reviewsConcurrency });

  return reviewsWorker;
}
