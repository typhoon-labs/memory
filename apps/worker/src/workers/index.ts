import { createScoringModel } from '@typhoon/ai';
import { isScoringEnabled } from '@typhoon/config';
import { createDb } from '@typhoon/db';
import { ScorerRepo } from '@typhoon/db/repos';
import type { ScorerDefinitionVersion } from '@typhoon/evals';
import { mapScorerRows } from '@typhoon/evals';
import { createAppLogger } from '@typhoon/logger';
import type { RedisProvider } from '@typhoon/queue';
import type { Worker } from 'bullmq';
import postgres from 'postgres';

import { getMaintenanceQueue, getReviewsQueue, getScoringQueue, getSyncQueue } from '../infra/queue';
import { createWorkerServices } from '../services';
import { createExperimentsWorker } from './experiments.worker';
import { createMaintenanceWorker } from './maintenance.worker';
import { createReviewsWorker } from './reviews.worker';
import { createScoringWorker } from './scoring.worker';
import { createSyncWorker } from './sync.worker';

const log = createAppLogger('worker');

// Tracked at module scope so shutdownWorkers() can drain in-flight jobs
// gracefully on SIGTERM/SIGINT (see apps/worker/src/index.ts).
const _workers = new Map<string, Worker>();

// Scorer definition cache — refreshed every 5 minutes by the scoring worker.
let _cachedScorerDefs: ScorerDefinitionVersion[] = [];
let _lastScorerLoad = 0;
const SCORER_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function startWorkers(redis: RedisProvider, databaseUrl: string) {
  const workerSql = postgres(databaseUrl, {
    onnotice: (notice) => {
      log.debug(notice.message, { code: notice.code });
    },
  });
  const db = createDb(workerSql);
  const { scoringService, vectorStore } = createWorkerServices(db, workerSql);
  const syncQueue = getSyncQueue();
  const scorerRepo = new ScorerRepo(db);

  /** Refresh scorer definitions from the database if the cache has expired. */
  async function refreshScorerDefinitions() {
    const now = Date.now();
    if (now - _lastScorerLoad < SCORER_REFRESH_MS && _cachedScorerDefs.length > 0) return;
    try {
      const rows = await scorerRepo.listPublished();
      _cachedScorerDefs = mapScorerRows(rows);
      _lastScorerLoad = now;
      log.info('Refreshed scorer definitions', { count: _cachedScorerDefs.length });
    } catch (err) {
      log.error('Failed to refresh scorer definitions', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function getCachedScorerDefs(): ScorerDefinitionVersion[] {
    return _cachedScorerDefs;
  }

  // ── Maintenance worker (always runs — not conditional on scoring) ──
  const maintenanceQueue = getMaintenanceQueue();
  const maintenanceWorker = createMaintenanceWorker({ redis, db, maintenanceQueue });
  _workers.set('maintenance', maintenanceWorker);

  // ── Sync worker ───────────────────────────────────────────────────
  const syncWorker = createSyncWorker({ redis, db, sql: workerSql, vectorStore, syncQueue });
  _workers.set('sync', syncWorker);

  // ── Shared scoring dependencies ───────────────────────────────────
  const flowProducer = redis.createFlowProducer();
  const scoringDeps = scoringService.toScoringDeps();

  // ── Reviews worker ────────────────────────────────────────────────
  if (isScoringEnabled()) {
    const reviewsQueue = getReviewsQueue();
    const reviewsWorker = createReviewsWorker({
      redis,
      db,
      createScoringModel,
      scoringDeps,
      flowProducer,
      reviewsQueue,
      refreshScorerDefinitions,
      getCachedScorerDefs,
    });
    _workers.set('reviews', reviewsWorker);

    // ── Scoring worker (generic scorer execution) ─────────────────────
    const scoringWorker = createScoringWorker({
      redis,
      createScoringModel,
      scoringDeps,
    });
    _workers.set('scoring', scoringWorker);
  } else {
    log.info('Reviews and scoring workers disabled (SCORING_ENABLED)');
  }

  // ── Experiments worker ──────────────────────────────────────────────
  const scoringQueue = getScoringQueue();
  const experimentWorker = createExperimentsWorker({
    redis,
    db,
    vectorStore,
    createScoringModel,
    flowProducer,
    scoringQueue,
    refreshScorerDefinitions,
    getCachedScorerDefs,
  });
  _workers.set('experiments', experimentWorker);

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
