import { describe, expect, it, vi } from 'vitest';

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: vi.fn().mockReturnValue({ startSpan: vi.fn() }) },
  metrics: { getMeter: vi.fn().mockReturnValue({ createCounter: vi.fn() }) },
  SpanStatusCode: { UNSET: 0, OK: 1, ERROR: 2 },
}));

vi.mock('@mastra/observability', () => ({
  Observability: class MockObservability {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
  DefaultExporter: class MockDefaultExporter {},
}));

vi.mock('@mastra/otel-bridge', () => ({
  OtelBridge: class MockOtelBridge {
    type = 'otel-bridge';
  },
}));

vi.mock('./metrics', () => ({
  chunkSizeChars: { record: vi.fn() },
  conversationStarted: { add: vi.fn() },
  embedRetryCount: { add: vi.fn() },
  embedTokenUsage: { record: vi.fn() },
  syncJobCompleted: { add: vi.fn() },
  syncJobDuration: { record: vi.fn() },
  syncJobFailed: { add: vi.fn() },
  syncJobStalled: { add: vi.fn() },
  syncQueueDepth: {},
  syncStageDuration: { record: vi.fn() },
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

  it('re-exports SpanStatusCode', async () => {
    const { SpanStatusCode } = await import('./index');
    expect(SpanStatusCode).toBeDefined();
  });

  it('re-exports embedding metrics', async () => {
    const { chunkSizeChars, embedRetryCount, embedTokenUsage } = await import('./index');
    expect(chunkSizeChars).toBeDefined();
    expect(embedRetryCount).toBeDefined();
    expect(embedTokenUsage).toBeDefined();
  });

  it('re-exports sync metrics', async () => {
    const { syncJobCompleted, syncJobDuration, syncJobFailed, syncJobStalled, syncQueueDepth, syncStageDuration } =
      await import('./index');
    expect(syncJobCompleted).toBeDefined();
    expect(syncJobDuration).toBeDefined();
    expect(syncJobFailed).toBeDefined();
    expect(syncJobStalled).toBeDefined();
    expect(syncQueueDepth).toBeDefined();
    expect(syncStageDuration).toBeDefined();
  });
});
