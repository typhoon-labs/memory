import '@typhoon/telemetry/instrumentation';
import { createAppLogger } from '@typhoon/logger';
import { RedisProvider } from '@typhoon/queue';

import { refreshScheduler, stopScheduler } from './cron/sync-scheduler';
import { startHealthServer } from './infra/health';
import { initSyncQueue, shutdownQueues } from './infra/queue';

const log = createAppLogger('scheduler');

const redis = new RedisProvider();
initSyncQueue(redis);

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
