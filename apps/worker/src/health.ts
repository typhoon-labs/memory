import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('health');

/**
 * Minimal HTTP health server for K8s liveness/readiness probes.
 * Returns 200 on GET /healthz, 404 on everything else.
 */
export function startHealthServer(port = 5170): void {
  Bun.serve({
    port,
    hostname: '0.0.0.0',
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return new Response('ok', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    },
  });
  log.info('Health server started', { port });
}
