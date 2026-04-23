import { describe, expect, it, vi } from 'vitest';

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: vi.fn().mockReturnValue({ startSpan: vi.fn() }) },
  metrics: { getMeter: vi.fn().mockReturnValue({ createCounter: vi.fn() }) },
}));

vi.mock('@mastra/observability', () => ({
  Observability: class MockObservability {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
}));

vi.mock('@mastra/otel-bridge', () => ({
  OtelBridge: class MockOtelBridge {
    type = 'otel-bridge';
  },
}));

vi.mock('./metrics', () => ({
  conversationStarted: { add: vi.fn() },
}));

vi.mock('./hono-middleware', () => ({
  otelMiddleware: vi.fn(),
}));

describe('index exports', () => {
  it('exports getTracer that returns a tracer', async () => {
    const { getTracer } = await import('./index');
    const tracer = getTracer('test');
    expect(tracer).toBeDefined();
    expect(tracer.startSpan).toBeDefined();
  });

  it('exports getMeter that returns a meter', async () => {
    const { getMeter } = await import('./index');
    const meter = getMeter('test');
    expect(meter).toBeDefined();
  });

  it('exports createMastraObservability that returns an Observability instance', async () => {
    const { createMastraObservability } = await import('./index');
    const obs = createMastraObservability('test-service');
    expect(obs).toBeDefined();
  });

  it('re-exports otelMiddleware', async () => {
    const { otelMiddleware } = await import('./index');
    expect(otelMiddleware).toBeDefined();
  });

  it('re-exports conversationStarted metric', async () => {
    const { conversationStarted } = await import('./index');
    expect(conversationStarted).toBeDefined();
  });
});
