import { Mastra } from '@mastra/core';
import { createExperimentAgent } from '@typhoon/agents';
import { createScoringModel } from '@typhoon/ai';
import { isScoringEnabled } from '@typhoon/config';
import { createDb, messages, threads } from '@typhoon/db';
import { DrizzleDatasetsStorage, DrizzleExperimentsStorage, PgVector } from '@typhoon/db/drivers/pg';
import type { ScorerDefinitionVersion, ScoringDeps } from '@typhoon/evals';
import {
  BUILTIN_SCORER_DEFS,
  completeExperiment,
  mapScorerRows,
  PUBLISHED_SCORERS_QUERY,
  prepareScoring,
  processExperimentItemStep1,
  processExperimentItemStep2,
  runSingleScorer,
  setupExperiment,
} from '@typhoon/evals';
import {
  handleDeleteFileJob,
  handleProcessFileJob,
  handleScanJob,
  incrementSyncJobCompletion,
  managePartitions,
} from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import type {
  ExperimentCompleteJobData,
  ExperimentItemJobData,
  ExperimentJobData,
  ScoringAggregateJobData,
  ScoringJobData,
  ScoringRunJobData,
} from '@typhoon/queue';
import type { ConnectionOptions } from 'bullmq';
import { FlowProducer, UnrecoverableError, WaitingChildrenError, Worker } from 'bullmq';
import { and, desc, eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { getReviewsQueue, getScoringQueue, getSyncQueue } from './queue';

const log = createAppLogger('worker');

// Tracked at module scope so shutdownWorkers() can drain in-flight jobs
// gracefully on SIGTERM/SIGINT (see apps/worker/src/index.ts).
const _workers = new Map<string, Worker>();

// Scorer definition cache — refreshed every 5 minutes by the scoring worker.
let _cachedScorerDefs: ScorerDefinitionVersion[] = [];
let _lastScorerLoad = 0;
const SCORER_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function startWorkers(redisUrl: string, databaseUrl: string) {
  const connection: ConnectionOptions = { url: redisUrl };
  const workerSql = postgres(databaseUrl, {
    onnotice: (notice) => {
      log.debug(notice.message, { code: notice.code });
    },
  });
  const db = createDb(workerSql);
  const vectorStore = new PgVector({ id: 'typhoon-vectors', sql: workerSql });
  const syncQueue = getSyncQueue();

  const concurrency = Number(process.env.SYNC_WORKER_CONCURRENCY ?? '5');
  const lockDuration = Number(process.env.SYNC_WORKER_LOCK_DURATION_MS ?? String(2 * 60 * 1000));
  const stalledInterval = Number(process.env.SYNC_WORKER_STALLED_INTERVAL_MS ?? '60000');
  const maxStalledCount = Number(process.env.SYNC_WORKER_MAX_STALLED_COUNT ?? '3');

  // ── Sync worker ───────────────────────────────────────────────────
  const syncWorker = new Worker(
    'sync',
    async (job) => {
      switch (job.name) {
        case 'scan':
          return handleScanJob(job, db, syncQueue);
        case 'process-file':
          return handleProcessFileJob(job, db, vectorStore);
        case 'delete-file':
          return handleDeleteFileJob(job, db, vectorStore);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    {
      connection,
      concurrency,
      lockDuration,
      stalledInterval,
      maxStalledCount,
      limiter: {
        max: Number(process.env.SYNC_QUEUE_RATE_MAX ?? '10'),
        duration: Number(process.env.SYNC_QUEUE_RATE_DURATION_MS ?? '1000'),
      },
    },
  );
  _workers.set('sync', syncWorker);

  log.info('Sync worker started', { concurrency, lockDuration, stalledInterval, maxStalledCount });

  syncWorker.on('error', (err) => {
    log.error('Worker connection error', { error: err.message });
  });

  syncWorker.on('failed', (job, err) => {
    log.error('Job failed', { job: job?.name, jobId: job?.id, error: err.message });
    const syncJobId = (job?.data as { syncJobId?: string } | undefined)?.syncJobId;
    if (syncJobId) {
      incrementSyncJobCompletion(db, syncJobId, true).catch((err: unknown) => {
        log.error('Failed to increment sync job completion', {
          syncJobId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  });

  syncWorker.on('completed', (job) => {
    log.debug('Job completed', { job: job.name, jobId: job.id });
  });

  /** Refresh scorer definitions from the database if the cache has expired. */
  async function refreshScorerDefinitions() {
    const now = Date.now();
    if (now - _lastScorerLoad < SCORER_REFRESH_MS && _cachedScorerDefs.length > 0) return;
    try {
      const rows = await workerSql.unsafe(PUBLISHED_SCORERS_QUERY);
      _cachedScorerDefs = mapScorerRows(rows as Array<Record<string, unknown>>);
      _lastScorerLoad = now;
      log.info('Refreshed scorer definitions', { count: _cachedScorerDefs.length });
    } catch (err) {
      log.error('Failed to refresh scorer definitions', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Shared scoring dependencies ───────────────────────────────────
  const scoringModel = createScoringModel();
  const flowProducer = new FlowProducer({ connection });

  const scoringDeps: ScoringDeps = {
    fetchMessages: async (messageId: string) => {
      const [assistantMsg] = await db.select().from(messages).where(eq(messages.externalId, messageId));
      if (!assistantMsg) {
        log.warn('Scoring: assistant message not found', { messageId });
        return null;
      }

      const [userMsg] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.threadId, assistantMsg.threadId),
            eq(messages.role, 'user'),
            // Exclude PrefillErrorHandler retry messages (contain systemReminder metadata)
            sql`${messages.content}->'metadata'->'systemReminder' IS NULL`,
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (!userMsg) {
        log.warn('Scoring: no user message in thread', { messageId, threadId: assistantMsg.threadId });
        return null;
      }
      return {
        assistantContent: assistantMsg.content,
        userContent: userMsg.content,
        messageExternalId: assistantMsg.externalId,
      };
    },

    resolveLatestAssistantMessage: async (threadExternalId: string) => {
      const [thread] = await db
        .select({ id: threads.id })
        .from(threads)
        .where(eq(threads.externalId, threadExternalId));
      if (!thread) return null;

      const [msg] = await db
        .select({ externalId: messages.externalId })
        .from(messages)
        .where(and(eq(messages.threadId, thread.id), eq(messages.role, 'assistant')))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      return msg?.externalId ?? null;
    },

    hydrateChunks: async (chunkIds: string[]) => {
      if (chunkIds.length === 0) return new Map();
      const rows = await vectorStore.getChunksByIds('knowledge_base', chunkIds);
      return new Map(rows.map((r) => [r.id, (r.metadata?.text as string) ?? '']));
    },

    hasExistingScore: async (entityId: string, scorerId: string) => {
      const [row] = await workerSql`
        SELECT 1 FROM "scores"
        WHERE "entity_id" = ${entityId}
          AND "entity_type" = 'message'
          AND "scorer_id" = ${scorerId}
        LIMIT 1
      `;
      return !!row;
    },

    saveScore: async (score: Record<string, unknown>) => {
      const keys = Object.keys(score);
      const cols = keys.map((k) => `"${k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const vals = keys.map((k) => {
        const v = score[k];
        return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
      });
      await workerSql.unsafe(
        `INSERT INTO "scores" (${cols}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals as (string | number | boolean | null)[],
      );
    },
  };

  // ── Reviews worker ────────────────────────────────────────────────
  if (isScoringEnabled()) {
    const reviewsConcurrency = Number(process.env.SCORING_CONCURRENCY ?? '5');

    const reviewsWorker = new Worker(
      'reviews',
      async (job) => {
        switch (job.name) {
          case 'partition-management': {
            const retDays = (job.data as { retentionDays?: number }).retentionDays ?? 90;
            const result = await managePartitions(workerSql as never, { retentionDays: retDays });
            log.info('Partition management complete', result);
            return result;
          }

          case 'score-message': {
            const data = job.data as ScoringJobData;
            try {
              await refreshScorerDefinitions();

              const prepared = await prepareScoring(
                {
                  messageId: data.messageId,
                  threadId: data.threadId,
                  agentId: data.agentId,
                  traceId: data.traceId,
                },
                scoringDeps,
                scoringModel,
                _cachedScorerDefs.length > 0 ? _cachedScorerDefs : undefined,
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
        connection,
        concurrency: reviewsConcurrency,
        lockDuration: 5 * 60 * 1000,
        stalledInterval: 150_000,
        maxStalledCount: 2,
      },
    );
    _workers.set('reviews', reviewsWorker);

    reviewsWorker.on('error', (err) => {
      log.error('Reviews worker error', { error: err.message });
    });
    reviewsWorker.on('failed', (job, err) => {
      log.error('Reviews job failed', { jobId: job?.id, name: job?.name, error: err.message });
    });
    reviewsWorker.on('completed', (job) => {
      log.debug('Reviews job completed', { jobId: job.id, name: job.name, result: job.returnvalue });
    });

    // Register partition management as a repeatable job on the reviews queue
    const reviewsQueue = getReviewsQueue();
    const retentionDays = Number(process.env.SPAN_RETENTION_DAYS ?? '90');
    reviewsQueue
      .add('partition-management', { retentionDays }, { repeat: { pattern: '0 2 * * *' }, jobId: 'partition-mgmt' })
      .catch((err: unknown) => log.error('Failed to register partition management job', { error: err }));

    log.info('Reviews worker started', { concurrency: reviewsConcurrency });

    // ── Scoring worker (generic scorer execution) ─────────────────────
    const scoringConcurrency = Number(process.env.SCORING_RUN_CONCURRENCY ?? '10');

    const scoringWorker = new Worker(
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
            scoringModel,
          );
        } catch (err) {
          if (err && typeof err === 'object' && 'unrecoverable' in err) {
            throw new UnrecoverableError(err instanceof Error ? err.message : String(err));
          }
          throw err;
        }
      },
      {
        connection,
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
    _workers.set('scoring', scoringWorker);

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
  } else {
    log.info('Reviews and scoring workers disabled (SCORING_ENABLED)');
  }

  // ── Experiments worker ──────────────────────────────────────────────
  const datasetsStorage = new DrizzleDatasetsStorage(db);
  const experimentsStorage = new DrizzleExperimentsStorage(db);
  const experimentAgent = createExperimentAgent();

  const experimentMastra = new Mastra({
    agents: { 'typhoon-experiment': experimentAgent },
    vectors: { pgVector: vectorStore },
    logger: log,
  });
  const registeredAgent = experimentMastra.getAgent('typhoon-experiment');

  const experimentDeps = {
    getExperiment: async (id: string) => {
      const [row] = await workerSql.unsafe('SELECT * FROM "experiments" WHERE id = $1', [id]);
      if (!row) return null;
      return row as unknown as {
        id: string;
        status: string;
        dataset_id: string;
        dataset_version: number;
        total_items: number;
      };
    },
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
  };

  const experimentsConcurrency = Number(process.env.EXPERIMENTS_CONCURRENCY ?? '3');
  const scoringQueue = getScoringQueue();

  const experimentWorker = new Worker(
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
            const scorerDefs = _cachedScorerDefs.length > 0 ? _cachedScorerDefs : BUILTIN_SCORER_DEFS;

            const result = await processExperimentItemStep1(
              { id: data.itemId, input: data.input, groundTruth: data.groundTruth },
              data.experimentId,
              registeredAgent,
              scoringModel,
              scorerDefs,
              { getExperiment: experimentDeps.getExperiment },
            );

            if (!result) {
              // Cancelled
              return { itemId: data.itemId, succeeded: false, scorersFailed: 0 };
            }

            // Add score-run children dynamically
            for (const def of result.applicableScorers) {
              await scoringQueue.add(
                'score-run',
                {
                  scorerName: def.name,
                  scorerDefinition: def,
                  userQuestion: result.question,
                  responseText: result.responseText,
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
          );

          // Atomic counter increment for progress tracking
          if (step2Result.succeeded) {
            await workerSql`UPDATE experiments SET succeeded_count = succeeded_count + 1 WHERE id = ${updatedData.experimentId}`;
          } else {
            await workerSql`UPDATE experiments SET failed_count = failed_count + 1 WHERE id = ${updatedData.experimentId}`;
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
      connection,
      concurrency: experimentsConcurrency,
      lockDuration: 10 * 60 * 1000,
      stalledInterval: 5 * 60 * 1000,
      maxStalledCount: 1,
    },
  );
  _workers.set('experiments', experimentWorker);

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

  return { syncWorker, syncQueue };
}

/**
 * Gracefully closes all tracked workers. Each `worker.close()` waits for
 * in-flight jobs to finish, but the wait is capped at `gracefulMs` so a
 * stuck job can't block shutdown indefinitely. Called from the SIGTERM
 * handler in apps/worker/src/index.ts before queues close.
 */
export async function shutdownWorkers(opts: { gracefulMs?: number } = {}): Promise<void> {
  const gracefulMs = opts.gracefulMs ?? 30_000;
  if (_workers.size === 0) return;

  log.info('Closing workers', { count: _workers.size, gracefulMs });
  await Promise.all(
    [..._workers.entries()].map(async ([name, worker]) => {
      try {
        await Promise.race([worker.close(), new Promise<void>((resolve) => setTimeout(resolve, gracefulMs))]);
      } catch (err) {
        log.error('Worker close error', { name, error: err instanceof Error ? err.message : String(err) });
      }
    }),
  );
  _workers.clear();
}
