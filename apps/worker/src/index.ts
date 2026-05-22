import '@typhoon/telemetry/instrumentation';
import { listSources } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { RedisProvider } from '@typhoon/queue';

import { registerAllSources } from './config/sources';
import { sql } from './infra/db';
import { startHealthServer } from './infra/health';
import { initVectorIndex } from './infra/init';
import {
  initExperimentQueue,
  initMaintenanceQueue,
  initReviewsQueue,
  initScoringQueue,
  initSyncQueue,
  shutdownQueues,
} from './infra/queue';
import { shutdownWorkers, startWorkers } from './workers';

const log = createAppLogger('worker');

registerAllSources();
for (const s of listSources()) {
  log.info('Registered credential source', { name: s.name });
}

await initVectorIndex(sql);

const redis = new RedisProvider();
const connectionString = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

initSyncQueue(redis);
initScoringQueue(redis);
initReviewsQueue(redis);
initExperimentQueue(redis);
initMaintenanceQueue(redis);
startWorkers(redis, connectionString);

const healthPort = Number(process.env.HEALTH_PORT ?? 5170);
startHealthServer(healthPort);

log.info('Worker started');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('Shutting down', { signal });
    await shutdownWorkers();
    await shutdownQueues();
    process.exit(0);
  });
}
