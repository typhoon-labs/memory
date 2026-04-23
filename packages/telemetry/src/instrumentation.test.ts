import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockStart = vi.fn();
  const mockShutdown = vi.fn().mockResolvedValue(undefined);
  return { mockStart, mockShutdown };
});

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class MockNodeSDK {
    start = mocks.mockStart;
    shutdown = mocks.mockShutdown;
  },
}));

vi.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: class {},
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
  OTLPMetricExporter: class {},
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: class {},
}));

vi.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: class {},
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: class {},
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

vi.mock('@opentelemetry/core', () => ({
  W3CTraceContextPropagator: class {},
}));

vi.mock('@opentelemetry/instrumentation-ioredis', () => ({
  IORedisInstrumentation: class {},
}));

vi.mock('@opentelemetry/instrumentation-pg', () => ({
  PgInstrumentation: class {},
}));

vi.mock('@appsignal/opentelemetry-instrumentation-bullmq', () => ({
  BullMQInstrumentation: class {},
}));

describe('instrumentation', () => {
  let sigTermHandler: (() => Promise<void>) | undefined;

  beforeEach(() => {
    vi.resetModules();
    mocks.mockStart.mockClear();
    mocks.mockShutdown.mockClear();

    vi.spyOn(process, 'on').mockImplementation((event, handler) => {
      if (event === 'SIGTERM') {
        sigTermHandler = handler as () => Promise<void>;
      }
      return process;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the SDK on module load', async () => {
    await import('./instrumentation');
    expect(mocks.mockStart).toHaveBeenCalledOnce();
  });

  it('registers a SIGTERM handler that shuts down the SDK', async () => {
    await import('./instrumentation');
    expect(sigTermHandler).toBeDefined();

    await sigTermHandler?.();
    expect(mocks.mockShutdown).toHaveBeenCalledOnce();
  });

  it('exports the sdk instance', async () => {
    const { sdk } = await import('./instrumentation');
    expect(sdk).toBeDefined();
    expect(sdk.start).toBe(mocks.mockStart);
  });
});
