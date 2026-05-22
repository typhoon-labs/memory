import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

const { mockChatRoute } = vi.hoisted(() => {
  const mockChatRoute = vi.fn().mockReturnValue({
    path: '/v1/widget/chat',
    method: 'GET',
    handler: vi.fn(),
  });
  return { mockChatRoute };
});

vi.mock('@mastra/ai-sdk', () => ({
  chatRoute: mockChatRoute,
}));

import { widgetRoutes } from './widget';

function mountRoutes(routes: Record<string, unknown>[]) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

describe('widgetRoutes', () => {
  it('has 2 entries', () => {
    expect(widgetRoutes).toHaveLength(2);
  });

  it('first route is at /v1/widget/config (GET)', () => {
    expect(widgetRoutes[0]).toMatchObject({
      path: '/v1/widget/config',
      method: 'GET',
    });
  });

  it('GET /v1/widget/config returns the JSON config', async () => {
    const app = mountRoutes([widgetRoutes[0]] as Record<string, unknown>[]);
    const res = await app.request('/v1/widget/config', { method: 'GET' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      name: 'Typhoon Support',
      welcomeMessage: 'Hello! How can I help you today?',
      placeholder: 'Type your question...',
    });
  });

  it('second entry is the chatRoute result with the right config', () => {
    expect(widgetRoutes[1]).toBeDefined();
    expect(mockChatRoute).toHaveBeenCalledWith({
      path: '/v1/widget/chat',
      agent: 'typhoon-supervisor',
      sendSources: true,
      sendReasoning: false,
    });
  });
});
