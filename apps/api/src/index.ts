import '@typhoon/telemetry/instrumentation';
import { type HonoBindings, type HonoVariables, MastraServer } from '@mastra/hono';
import { listRegisteredSyncTargets, listSources } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { otelMiddleware } from '@typhoon/telemetry';
import { Hono } from 'hono';
import { registerAllSources } from './config/sources';
import { registerAllSyncTargets } from './config/sync-targets';
import { db, sql } from './db';
import { initFailedJobArchiver } from './failed-job-archiver';
import { initVectorIndex, reconcileConfigSyncTargets } from './init';
import { mastra } from './mastra/index';
import { requestLogger } from './middleware/request-logger';
import { getQueue, initQueue, initSyncQueue, shutdownQueues, trackQueueEvents } from './queue';
import { setReviewsQueue } from './routes/chat';

const log = createAppLogger('api');

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
app.use('*', otelMiddleware());
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
  const syncQueue = initSyncQueue(redisUrl);
  initQueue('reports', redisUrl);
  initQueue('scoring', redisUrl);
  initQueue('reviews', redisUrl);
  initQueue('experiments', redisUrl);
  const archiverEvents = initFailedJobArchiver(syncQueue, redisUrl, db);
  trackQueueEvents('archiver', archiverEvents);
  setReviewsQueue(getQueue('reviews'));
}

const port = Number(process.env.PORT ?? 5172);
log.info('Server started', { port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('Shutting down', { signal });
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
