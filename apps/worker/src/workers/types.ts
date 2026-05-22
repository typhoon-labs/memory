import type { Db } from '@typhoon/db';
import type { PgVector } from '@typhoon/db/drivers/pg';
import type { ModelFactory, ScorerDefinitionVersion, ScoringDeps } from '@typhoon/evals';
import type { RedisProvider } from '@typhoon/queue';
import type { FlowProducer, Queue } from 'bullmq';
import type { Sql } from 'postgres';

export interface WorkerDeps {
  redis: RedisProvider;
  db: Db;
  sql: Sql;
  vectorStore: PgVector;
  createScoringModel: ModelFactory;
  scoringDeps: ScoringDeps;
  flowProducer: FlowProducer;
  syncQueue: Queue;
  scoringQueue: Queue;
  reviewsQueue: Queue;
}

export interface MaintenanceWorkerDeps {
  redis: RedisProvider;
  db: Db;
  maintenanceQueue: Queue;
}

export interface SyncWorkerDeps {
  redis: RedisProvider;
  db: Db;
  sql: Sql;
  vectorStore: PgVector;
  syncQueue: Queue;
}

export interface ReviewsWorkerDeps {
  redis: RedisProvider;
  db: Db;
  createScoringModel: ModelFactory;
  scoringDeps: ScoringDeps;
  flowProducer: FlowProducer;
  reviewsQueue: Queue;
  refreshScorerDefinitions: () => Promise<void>;
  getCachedScorerDefs: () => ScorerDefinitionVersion[];
}

export interface ScoringWorkerDeps {
  redis: RedisProvider;
  createScoringModel: ModelFactory;
  scoringDeps: ScoringDeps;
}

export interface ExperimentsWorkerDeps {
  redis: RedisProvider;
  db: Db;
  vectorStore: PgVector;
  createScoringModel: ModelFactory;
  flowProducer: FlowProducer;
  scoringQueue: Queue;
  refreshScorerDefinitions: () => Promise<void>;
  getCachedScorerDefs: () => ScorerDefinitionVersion[];
}
