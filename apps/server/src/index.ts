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
import { initQueue, initSyncQueue, shutdownQueues } from './queue.js';
import { refreshScheduler } from './scheduler.js';
import { shutdownWorkers, startWorkers } from './workers.js';

const log = createAppLogger('server');

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
app.use('*', requestLogger);
const server = new MastraServer({ app, mastra });
await server.init();

// Captured on first fetch — see the default export at the bottom of this
// file. Used by the /api/v1/* rewrite to disable Bun's idleTimeout for
// SSE streams via server.timeout(req, 0). Per Bun docs, this is the
// recommended pattern for long-lived streaming responses.
let bunServer: Bun.Server<undefined> | undefined;

// Rewrite /api/v1/* → /v1/* so custom routes (which can't use /api/ prefix
// per Mastra restriction) are accessible under the standard /api namespace.
app.all('/api/v1/*', async (c) => {
  // Disable Bun's idleTimeout for SSE streams BEFORE we lose the original
  // Request reference to the rewrite below. server.timeout() requires the
  // exact Request that Bun.serve passed to fetch(); the rewritten Request
  // we construct further down is a different object and Bun can't map it
  // back to the underlying socket. Detection is by Accept header so this
  // covers any current or future SSE endpoint without a hardcoded list.
  if (bunServer && c.req.header('accept')?.includes('text/event-stream')) {
    bunServer.timeout(c.req.raw, 0);
  }
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/v1/, '/v1');
  const newReq = new Request(url.toString(), {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
    signal: c.req.raw.signal,
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
  initQueue('reports', redisUrl);
  startWorkers(redisUrl, connectionString);
  await refreshScheduler();
}

const port = Number(process.env.PORT ?? 5172);
log.info('Server started', { port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('Shutting down', { signal });
    // Order matters: workers stop picking up new jobs and drain in-flight
    // work first, then queue connections close cleanly.
    await shutdownWorkers();
    await shutdownQueues();
    process.exit(0);
  });
}

// biome-ignore lint/style/noDefaultExport: Required for Bun HTTP server
export default {
  port,
  hostname: process.env.HOST ?? '0.0.0.0',
  // Bun.serve defaults idleTimeout to 10s; we raise it to 30s as a
  // sensible global ceiling. Long-lived SSE streams opt out individually
  // via server.timeout(req, 0) in the /api/v1/* rewrite above.
  idleTimeout: 30,
  fetch(req: Request, srv: Bun.Server<undefined>) {
    bunServer = srv;
    return app.fetch(req);
  },
};
