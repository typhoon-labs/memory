import { APP_ROLES } from '@typhoon/config';
import { createAppLogger } from '@typhoon/logger';
import { createMiddleware } from 'hono/factory';

const log = createAppLogger('auth');

/**
 * Middleware that requires the authenticated user to have the `admin` role.
 * Must be applied **after** `requireAuth` (expects `user` on context).
 */
export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get('user' as never) as { id: string; role?: string } | undefined;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== APP_ROLES.ADMIN) {
    log.warn('Forbidden: admin role required', { userId: user.id, role: user.role, path: c.req.path });
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
});
