import { describe, expect, it, vi } from 'vitest';

vi.mock('@hono/otel', () => ({
  httpInstrumentationMiddleware: vi.fn().mockReturnValue(async () => {}),
}));

describe('otelMiddleware', () => {
  it('re-exports httpInstrumentationMiddleware from @hono/otel', async () => {
    const { otelMiddleware } = await import('./hono-middleware');
    const { httpInstrumentationMiddleware } = await import('@hono/otel');
    expect(otelMiddleware).toBe(httpInstrumentationMiddleware);
  });
});
