import '@typhoon/telemetry/instrumentation';
import { listSources } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { registerAllSources } from './config/sources';
import { sql } from './db';
import { startHealthServer } from './health';
import { initVectorIndex } from './init';
import { initExperimentQueue, initScoringQueue, initSyncQueue, shutdownQueues } from './queue';
import { shutdownWorkers, startWorkers } from './workers';

const log = createAppLogger('worker');

registerAllSources();
for (const s of listSources()) {
  log.info('Registered credential source', { name: s.name });
}

await initVectorIndex(sql);

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connectionString = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

initSyncQueue(redisUrl);
initScoringQueue(redisUrl);
initExperimentQueue(redisUrl);
startWorkers(redisUrl, connectionString);

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
