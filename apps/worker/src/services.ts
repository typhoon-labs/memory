import type { Db } from '@typhoon/db';
import { PgVector } from '@typhoon/db/drivers/pg';
import { MessageRepo, ScoreRepo, ThreadRepo } from '@typhoon/db/repos';
import { ScoringService } from '@typhoon/services';
import type { Sql } from 'postgres';

/**
 * Worker composition root — wires repos and services using the worker's own
 * database connection so every data-access call shares the same pool.
 */
export function createWorkerServices(db: Db, sql: Sql) {
  const messageRepo = new MessageRepo(db);
  const threadRepo = new ThreadRepo(db);
  const scoreRepo = new ScoreRepo(db);
  const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

  const scoringService = new ScoringService({
    messageRepo,
    threadRepo,
    scoreRepo,
    vectorStore,
  });

  return { scoringService, vectorStore };
}
