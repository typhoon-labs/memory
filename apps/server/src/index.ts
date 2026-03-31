import { type HonoBindings, type HonoVariables, MastraServer } from '@mastra/hono';
import { listRegisteredSyncTargets, listSources } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { Hono } from 'hono';
import { registerAllSources } from './config/sources.js';
import { registerAllSyncTargets } from './config/sync-targets.js';
import { db, sql } from './db.js';
import { initVectorIndex, reconcileConfigSyncTargets } from './init.js';
import { mastra } from './mastra/index.js';
import { requestLogger } from './middleware/request-logger.js';
import { initSyncQueue } from './queue.js';
import { refreshScheduler } from './scheduler.js';
import { startWorkers } from './workers.js';

const log = createAppLogger('server');

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
app.use('*', requestLogger);
const server = new MastraServer({ app, mastra });
await server.init();

// Rewrite /api/v1/* → /v1/* so custom routes (which can't use /api/ prefix
// per Mastra restriction) are accessible under the standard /api namespace.
app.all('/api/v1/*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/v1/, '/v1');
  const newReq = new Request(url.toString(), {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
    // @ts-expect-error -- duplex required for streaming request bodies in Bun
    duplex: 'half',
  });
  return app.fetch(newReq);
});

await bootstrap();

async function bootstrap() {
  // Register credential sources and sync targets, then reconcile to DB
  registerAllSources();
  for (const s of listSources()) {
    log.info('Registered credential source', { name: s.name });
  }
  registerAllSyncTargets();
  for (const t of listRegisteredSyncTargets()) {
    log.info('Registered sync target', { name: t.name, sourceType: t.sourceType });
  }

  await initVectorIndex(sql);
  await reconcileConfigSyncTargets(db, listRegisteredSyncTargets());

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
  initSyncQueue(redisUrl);
  startWorkers(redisUrl, connectionString);
  await refreshScheduler();
}

const port = Number(process.env.PORT ?? 5172);
log.info('Server started', { port, host: process.env.HOST ?? '0.0.0.0' });

// biome-ignore lint/style/noDefaultExport: Required for Bun HTTP server
export default {
  port,
  hostname: process.env.HOST ?? '0.0.0.0',
  fetch: app.fetch,
};
