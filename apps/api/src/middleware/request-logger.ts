import { createAppLogger } from '@typhoon/logger';
import { createMiddleware } from 'hono/factory';

const log = createAppLogger('http');

export const requestLogger = createMiddleware(async (c, next) => {
  const start = performance.now();
  await next();
  const duration = Math.round(performance.now() - start);
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;

  if (status >= 500) {
    log.error('Request failed', { method, path, status, duration });
  } else if (status >= 400) {
    log.warn('Client error', { method, path, status, duration });
  } else {
    log.debug('Request completed', { method, path, status, duration });
  }
});
