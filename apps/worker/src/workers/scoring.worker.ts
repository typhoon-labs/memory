import { runSingleScorer } from '@typhoon/evals';
import { createAppLogger } from '@typhoon/logger';
import type { ScoringRunJobData } from '@typhoon/queue';
import { UnrecoverableError } from 'bullmq';
import type { Worker } from 'bullmq';

import type { ScoringWorkerDeps } from './types';

const log = createAppLogger('worker');

/**
 * Creates the BullMQ Worker for the 'scoring' queue.
 * Handles score-run jobs by calling runSingleScorer.
 */
export function createScoringWorker(deps: ScoringWorkerDeps): Worker {
  const { redis, createScoringModel, scoringDeps } = deps;

  const scoringConcurrency = Number(process.env.SCORING_RUN_CONCURRENCY ?? '10');

  const scoringWorker = redis.createWorker(
    'scoring',
    async (job) => {
      if (job.name !== 'score-run') {
        throw new Error(`Unknown scoring job type: ${job.name}`);
      }

      const data = job.data as ScoringRunJobData;
      try {
        return await runSingleScorer(
          {
            scorerDefinition: data.scorerDefinition,
            userQuestion: data.userQuestion,
            responseText: data.responseText,
            context: data.context,
            persist: data.persist,
          },
          { hasExistingScore: scoringDeps.hasExistingScore, saveScore: scoringDeps.saveScore },
          createScoringModel,
        );
      } catch (err) {
        if (err && typeof err === 'object' && 'unrecoverable' in err) {
          throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
        }
        throw err;
      }
    },
    {
      concurrency: scoringConcurrency,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 150_000,
      maxStalledCount: 2,
      limiter: {
        max: Number(process.env.SCORING_RUN_RATE_MAX ?? '15'),
        duration: 1000,
      },
    },
  );

  scoringWorker.on('error', (err) => {
    log.error('Scoring worker error', { error: err.message });
  });
  scoringWorker.on('failed', (job, err) => {
    log.error('Scoring job failed', { jobId: job?.id, error: err.message });
  });
  scoringWorker.on('completed', (job) => {
    log.debug('Scoring job completed', { jobId: job.id, result: job.returnvalue });
  });

  log.info('Scoring worker started', { concurrency: scoringConcurrency });

  return scoringWorker;
}
