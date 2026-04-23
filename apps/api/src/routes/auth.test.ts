import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuthHandler } = vi.hoisted(() => ({
  mockAuthHandler: vi.fn(),
}));

vi.mock('../auth', () => ({
  auth: {
    handler: mockAuthHandler,
  },
}));

import { authRoutes } from './auth';

function mountRoutes(routes: Record<string, unknown>[]) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    // biome-ignore lint/suspicious/noExplicitAny: Hono type narrowing for dynamic method dispatch
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

describe('authRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports an array with one route at /v1/auth/* (ALL method)', () => {
    expect(authRoutes).toHaveLength(1);
    expect(authRoutes[0]).toMatchObject({
      path: '/v1/auth/*',
      method: 'ALL',
    });
  });

  it('route has requiresAuth: false', () => {
    expect(authRoutes[0]).toMatchObject({ requiresAuth: false });
  });

  it('handler delegates to auth.handler with the raw Request object', async () => {
    const fakeAuthResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
    mockAuthHandler.mockResolvedValue(fakeAuthResponse);

    const app = mountRoutes(authRoutes as Record<string, unknown>[]);
    await app.request('/v1/auth/session', { method: 'GET' });

    expect(mockAuthHandler).toHaveBeenCalledTimes(1);
    const rawRequest = mockAuthHandler.mock.calls[0][0];
    expect(rawRequest).toBeInstanceOf(Request);
    expect(new URL(rawRequest.url).pathname).toBe('/v1/auth/session');
  });

  it('handler returns whatever auth.handler returns', async () => {
    const fakeBody = { user: { id: 'u-1', email: 'test@example.com' } };
    const fakeAuthResponse = new Response(JSON.stringify(fakeBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    mockAuthHandler.mockResolvedValue(fakeAuthResponse);

    const app = mountRoutes(authRoutes as Record<string, unknown>[]);
    const res = await app.request('/v1/auth/session', { method: 'GET' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(fakeBody);
  });
});
