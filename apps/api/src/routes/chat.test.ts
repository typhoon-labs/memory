import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHandleChatStream, mockCreateUIMessageStreamResponse } = vi.hoisted(() => ({
  mockHandleChatStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
}));

vi.mock('@mastra/ai-sdk', () => ({
  handleChatStream: mockHandleChatStream,
}));

vi.mock('ai', () => ({
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
}));

vi.mock('@typhoon/config', () => ({
  isScoringEnabled: () => true,
}));

vi.mock('@typhoon/telemetry', () => ({
  conversationStarted: { add: vi.fn() },
  getActiveTraceId: () => 'test-trace-id',
}));

vi.mock('../middleware/require-auth', async () => {
  const { createMiddleware } = await import('hono/factory');
  return {
    requireAuth: createMiddleware(async (c, next) => {
      c.set('user' as never, { id: 'user-1', email: 'test@test.example', role: 'admin' });
      await next();
    }),
  };
});

import { chatRoutes, setScoringQueue } from './chat';

/**
 * Build a Hono app that injects context variables via middleware
 * BEFORE the route handler runs.
 */
function createApp(ctx: { mastra?: unknown; requestContext?: unknown } = {}) {
  const app = new Hono();
  // Middleware to set context variables the handler reads via c.get()
  app.use('*', async (c, next) => {
    c.set('mastra' as never, ctx.mastra ?? {});
    c.set('requestContext' as never, ctx.requestContext ?? {});
    await next();
  });
  // Mount the route handler with middleware
  for (const route of chatRoutes as Record<string, unknown>[]) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    // biome-ignore lint/suspicious/noExplicitAny: dynamic route mounting for tests
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

describe('chatRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports an array with one route at /v1/chat/:agentId (POST)', () => {
    expect(chatRoutes).toHaveLength(1);
    expect(chatRoutes[0]).toMatchObject({
      path: '/v1/chat/:agentId',
      method: 'POST',
    });
  });

  it('handler calls handleChatStream with correct agentId, mastra context, and body', async () => {
    const fakeMastra = { agents: {} };
    const fakeRequestContext = { userId: 'u-1' };
    const fakeStream = Symbol('stream');
    const fakeResponse = new Response('ok');

    mockHandleChatStream.mockResolvedValue(fakeStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(fakeResponse);

    const app = createApp({ mastra: fakeMastra, requestContext: fakeRequestContext });

    const body = { messages: [{ role: 'user', content: 'hello' }] };
    const res = await app.request('/v1/chat/my-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockHandleChatStream).toHaveBeenCalledTimes(1);

    const callArgs = mockHandleChatStream.mock.calls[0][0];
    expect(callArgs.mastra).toBe(fakeMastra);
    expect(callArgs.agentId).toBe('my-agent');
    expect(callArgs.version).toBe('v6');
    expect(callArgs.sendSources).toBe(true);
    expect(callArgs.sendReasoning).toBe(false);
    expect(callArgs.params.messages).toEqual(body.messages);
    expect(callArgs.params.requestContext).toBe(fakeRequestContext);
    expect(callArgs.params.abortSignal).toBeDefined();
  });

  it('handler returns the result from createUIMessageStreamResponse', async () => {
    const fakeStream = Symbol('stream');
    const fakeResponse = new Response('streamed-body');

    mockHandleChatStream.mockResolvedValue(fakeStream);
    mockCreateUIMessageStreamResponse.mockReturnValue(fakeResponse);

    const app = createApp();

    await app.request('/v1/chat/agent-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(mockCreateUIMessageStreamResponse).toHaveBeenCalledWith({ stream: fakeStream });
  });

  it('passes streamLoggingHooks that do not throw when invoked', async () => {
    mockHandleChatStream.mockResolvedValue(Symbol('stream'));
    mockCreateUIMessageStreamResponse.mockReturnValue(new Response('ok'));

    const app = createApp();
    await app.request('/v1/chat/agent-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    const { defaultOptions: hooks } = mockHandleChatStream.mock.calls[0][0];
    expect(hooks).toBeDefined();

    // Exercise each hook — they should log but not throw
    expect(() => hooks.onChunk({ type: 'text-delta' })).not.toThrow();
    expect(() => hooks.onStepFinish({ text: 'hi', finishReason: 'stop', usage: {} })).not.toThrow();
    expect(() => hooks.onFinish({ text: 'hi', finishReason: 'stop', usage: {}, steps: [{}] })).not.toThrow();
    expect(() => hooks.onError(new Error('stream broke'))).not.toThrow();
    expect(() => hooks.onAbort()).not.toThrow();
  });

  it('returns 404 when agentId param is missing', async () => {
    const app = createApp();

    const res = await app.request('/v1/chat/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(res.status).toBe(404);
    expect(mockHandleChatStream).not.toHaveBeenCalled();
  });

  describe('scoring integration', () => {
    it('enqueues scoring job when enabled and threadId present', async () => {
      const mockAdd = vi.fn().mockResolvedValue({});
      setScoringQueue({ add: mockAdd } as never);

      mockHandleChatStream.mockResolvedValue(Symbol('stream'));
      mockCreateUIMessageStreamResponse.mockReturnValue(new Response('ok'));

      const app = createApp();

      await app.request('/v1/chat/my-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hello' }],
          memory: { thread: 'thread-123', resource: 'user-1' },
        }),
      });

      // Trigger the onFinish hook
      const { defaultOptions: hooks } = mockHandleChatStream.mock.calls[0][0];
      hooks.onFinish({ text: 'response', finishReason: 'stop', usage: {}, steps: [] });

      // Wait for the fire-and-forget promise
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAdd).toHaveBeenCalledTimes(1);
      const [jobName, jobData, jobOpts] = mockAdd.mock.calls[0];
      expect(jobName).toBe('score-message');
      expect(jobData.threadId).toBe('thread-123');
      expect(jobData.agentId).toBe('my-agent');
      expect(jobData.traceId).toBe('test-trace-id');
      expect(jobOpts.delay).toBe(3000);
      expect(jobOpts.jobId).toMatch(/^score-thread-123-/);
    });

    it('does not enqueue when no threadId', async () => {
      const mockAdd = vi.fn().mockResolvedValue({});
      setScoringQueue({ add: mockAdd } as never);

      mockHandleChatStream.mockResolvedValue(Symbol('stream'));
      mockCreateUIMessageStreamResponse.mockReturnValue(new Response('ok'));

      const app = createApp();

      await app.request('/v1/chat/my-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });

      const { defaultOptions: hooks } = mockHandleChatStream.mock.calls[0][0];
      hooks.onFinish({ text: 'response', finishReason: 'stop', usage: {}, steps: [] });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('handles scoring queue add failure gracefully', async () => {
      const mockAdd = vi.fn().mockRejectedValue(new Error('Redis down'));
      setScoringQueue({ add: mockAdd } as never);

      mockHandleChatStream.mockResolvedValue(Symbol('stream'));
      mockCreateUIMessageStreamResponse.mockReturnValue(new Response('ok'));

      const app = createApp();

      await app.request('/v1/chat/my-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          memory: { thread: 'thread-1' },
        }),
      });

      const { defaultOptions: hooks } = mockHandleChatStream.mock.calls[0][0];
      // Should not throw even when queue.add fails
      expect(() => hooks.onFinish({ text: 'response' })).not.toThrow();
    });
  });
});
