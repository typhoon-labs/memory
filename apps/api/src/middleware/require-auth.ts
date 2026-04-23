import { createAppLogger } from '@typhoon/logger';
import { createMiddleware } from 'hono/factory';
import { auth } from '../auth';

const log = createAppLogger('auth');

export const requireAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    log.warn('Unauthorized request', { path: c.req.path });
    return c.json({ error: 'Unauthorized' }, 401);
  }
  log.debug('Authenticated', { userId: session.user.id, path: c.req.path });
  c.set('user' as never, session.user);
  c.set('session' as never, session.session);
  await next();
});
