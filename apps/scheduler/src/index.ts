import '@typhoon/telemetry/instrumentation';
import { createAppLogger } from '@typhoon/logger';
import { startHealthServer } from './health';
import { initSyncQueue, shutdownQueues } from './queue';
import { refreshScheduler, stopScheduler } from './scheduler';

const log = createAppLogger('scheduler');

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
initSyncQueue(redisUrl);

await refreshScheduler();

// Poll for schedule changes every 60s — picks up sync target
// creates/updates/deletes made by the API.
const refreshInterval = setInterval(() => {
  refreshScheduler().catch((err) => {
    log.error('Scheduler refresh failed', { error: err instanceof Error ? err.message : String(err) });
  });
}, 60_000);

const healthPort = Number(process.env.HEALTH_PORT ?? 5171);
startHealthServer(healthPort);

log.info('Scheduler started');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('Shutting down', { signal });
    clearInterval(refreshInterval);
    stopScheduler();
    await shutdownQueues();
    process.exit(0);
  });
}
