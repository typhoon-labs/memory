import { Mastra } from '@mastra/core';
import type { ExperimentDeps, ScorerDefinitionVersion, ScoringDeps } from '@typhoon/agents';
import {
  createExperimentAgent,
  handleExperimentJob,
  mapScorerRows,
  PUBLISHED_SCORERS_QUERY,
  scoreMessage,
} from '@typhoon/agents';
import { createScoringModel } from '@typhoon/ai';
import { isScoringEnabled } from '@typhoon/config';
import { createDb, messages, threads } from '@typhoon/db';
import { DrizzleDatasetsStorage, DrizzleExperimentsStorage, PgVector } from '@typhoon/db/drivers/pg';
import type { ExperimentJobData, ScoringJobData } from '@typhoon/ingestion';
import {
  handleDeleteFileJob,
  handleProcessFileJob,
  handleScanJob,
  incrementSyncJobCompletion,
  managePartitions,
} from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import type { ConnectionOptions } from 'bullmq';
import { UnrecoverableError, Worker } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { getScoringQueue, getSyncQueue } from './queue';

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
  // 2 minutes. BullMQ's standard worker auto-renews the lock at lockDuration/2
  // (60s here), so as long as the event loop is responsive the lock is
  // continuously refreshed. When the worker dies (SIGKILL, OOM), the lock
  // expires within ~2 min and another worker claims the orphaned job —
  // 5x faster than the previous 10 min ceiling. Application-level hangs are
  // bounded separately by the per-stage withTimeout wrappers in the handlers.
  const lockDuration = Number(process.env.SYNC_WORKER_LOCK_DURATION_MS ?? String(2 * 60 * 1000));
  const stalledInterval = Number(process.env.SYNC_WORKER_STALLED_INTERVAL_MS ?? '60000');
  const maxStalledCount = Number(process.env.SYNC_WORKER_MAX_STALLED_COUNT ?? '3');

  // Per-stage timeouts inside the handlers (see packages/ingestion/src/util/
  // with-timeout.ts) are the real safety net. BullMQ's lockDuration provides
  // the ultimate stalled-job backstop. No need for an outer Promise.race here.
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
    // On terminal failure, increment the sync job completion counter so
    // the parent sync job eventually resolves. The success path is handled
    // inside the individual job handlers.
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
      // Keep using cached definitions on error
    }
  }

  // ── Scoring worker ──────────────────────────────────────────────────
  if (isScoringEnabled()) {
    const scoringConcurrency = Number(process.env.SCORING_CONCURRENCY ?? '5');
    const scoringModel = createScoringModel();

    // Build dependency functions for scoreMessage()
    const scoringDeps: ScoringDeps = {
      fetchMessages: async (messageId: string) => {
        const [assistantMsg] = await db.select().from(messages).where(eq(messages.externalId, messageId));
        if (!assistantMsg) {
          log.warn('Scoring: assistant message not found', { messageId });
          return null;
        }

        // Find the preceding user message in the same thread
        const [userMsg] = await db
          .select()
          .from(messages)
          .where(and(eq(messages.threadId, assistantMsg.threadId), eq(messages.role, 'user')))
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

    const scoringWorker = new Worker(
      'scoring',
      async (job) => {
        if (job.name === 'partition-management') {
          const retDays = (job.data as { retentionDays?: number }).retentionDays ?? 90;
          const result = await managePartitions(workerSql as never, { retentionDays: retDays });
          log.info('Partition management complete', result);
          return result;
        }

        const data = job.data as ScoringJobData;
        try {
          // Refresh scorer definitions from DB (cached, refreshes every 5 min)
          await refreshScorerDefinitions();

          return await scoreMessage(
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
        lockDuration: 5 * 60 * 1000, // 5 min — LLM calls can be slow
        stalledInterval: 150_000, // 2.5 min
        maxStalledCount: 2,
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

    // Register partition management as a repeatable job on the scoring queue
    const scoringQueue = getScoringQueue();
    const retentionDays = Number(process.env.SPAN_RETENTION_DAYS ?? '90');
    scoringQueue
      .add('partition-management', { retentionDays }, { repeat: { pattern: '0 2 * * *' }, jobId: 'partition-mgmt' })
      .catch((err: unknown) => log.error('Failed to register partition management job', { error: err }));

    log.info('Scoring worker started', { concurrency: scoringConcurrency });
  } else {
    log.info('Scoring worker disabled (SCORING_ENABLED)');
  }

  // ── Experiment worker ──────────────────────────────────────────────
  const datasetsStorage = new DrizzleDatasetsStorage(db);
  const experimentsStorage = new DrizzleExperimentsStorage(db);
  const experimentAgent = createExperimentAgent();
  const experimentModel = createScoringModel();

  // Register the experiment agent with Mastra so its tools get access to
  // the vector store (knowledge search needs context.mastra.getVector).
  const experimentMastra = new Mastra({
    agents: { 'typhoon-experiment': experimentAgent },
    vectors: { pgVector: vectorStore },
    logger: log,
  });
  // Retrieve the Mastra-wrapped agent so tool context is injected.
  const registeredAgent = experimentMastra.getAgent('typhoon-experiment');

  const experimentDeps: ExperimentDeps = {
    getExperiment: async (id: string) => {
      const [row] = await workerSql.unsafe(`SELECT * FROM "experiments" WHERE id = $1`, [id]);
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

  const experimentWorker = new Worker(
    'experiments',
    async (job) => {
      const { experimentId } = job.data as ExperimentJobData;
      const depsWithLock: ExperimentDeps = {
        ...experimentDeps,
        extendLock: async () => {
          await job.extendLock(job.token!, 30 * 60 * 1000);
        },
      };
      await refreshScorerDefinitions();
      return handleExperimentJob(experimentId, registeredAgent, experimentModel, depsWithLock, _cachedScorerDefs);
    },
    {
      connection,
      concurrency: 1, // one experiment at a time
      lockDuration: 30 * 60 * 1000, // 30 min
      stalledInterval: 10 * 60 * 1000, // 10 min
      maxStalledCount: 1,
    },
  );
  _workers.set('experiments', experimentWorker);

  experimentWorker.on('error', (err) => {
    log.error('Experiment worker error', { error: err.message });
  });
  experimentWorker.on('failed', (job, err) => {
    log.error('Experiment job failed', { jobId: job?.id, error: err.message });
  });
  experimentWorker.on('completed', (job) => {
    log.debug('Experiment job completed', { jobId: job.id, result: job.returnvalue });
  });

  log.info('Experiment worker started');

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
