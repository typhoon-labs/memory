import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requireAdmin } from './require-admin';

function createApp(user?: { id: string; role?: string }) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (user) c.set('user' as never, user);
    await next();
  });
  app.use('*', requireAdmin);
  app.get('/admin/test', (c) => c.json({ ok: true }));
  return app;
}

describe('requireAdmin', () => {
  it('allows admin users through', async () => {
    const app = createApp({ id: 'u-1', role: APP_ROLES.ADMIN });
    const res = await app.request('/admin/test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects rep users with 403', async () => {
    const app = createApp({ id: 'u-2', role: APP_ROLES.REP });
    const res = await app.request('/admin/test');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('rejects users with no role with 403', async () => {
    const app = createApp({ id: 'u-3' });
    const res = await app.request('/admin/test');
    expect(res.status).toBe(403);
  });

  it('returns 401 when no user is on context', async () => {
    const app = createApp();
    const res = await app.request('/admin/test');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});
