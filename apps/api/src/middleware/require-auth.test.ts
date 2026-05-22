import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock('../infra/auth.js', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

import { requireAuth } from './require-auth';

function createTestApp() {
  const app = new Hono();
  app.use('/protected/*', requireAuth);
  app.get('/protected/data', (c) => {
    return c.json({ ok: true });
  });
  return app;
}

describe('requireAuth', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);

    const app = createTestApp();
    const res = await app.request('/protected/data');

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('calls next and allows access when session exists', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
      session: { id: 'session-1' },
    });

    const app = createTestApp();
    const res = await app.request('/protected/data');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('passes request headers to getSession', async () => {
    mockGetSession.mockResolvedValue(null);

    const app = createTestApp();
    await app.request('/protected/data', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    const callArgs = mockGetSession.mock.calls[0][0];
    expect(callArgs).toHaveProperty('headers');
  });
});
