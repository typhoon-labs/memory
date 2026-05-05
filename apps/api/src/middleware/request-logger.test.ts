import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLog } = vi.hoisted(() => ({
  mockLog: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@typhoon/logger', () => ({
  createAppLogger: vi.fn(() => mockLog),
}));

import { requestLogger } from './request-logger';

describe('requestLogger', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.use('*', requestLogger);
    app.get('/ok', (c) => c.text('OK'));
    app.get('/bad', (c) => c.json({ error: 'bad' }, 400));
    app.get('/fail', () => {
      throw new Error('server error');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs debug for successful requests', async () => {
    await app.request('/ok');
    expect(mockLog.debug).toHaveBeenCalledWith('Request completed', expect.objectContaining({ status: 200 }));
  });

  it('logs warn for 4xx client errors', async () => {
    await app.request('/bad');
    expect(mockLog.warn).toHaveBeenCalledWith('Client error', expect.objectContaining({ status: 400 }));
  });

  it('logs error for 5xx server errors', async () => {
    app.onError((_err, c) => c.json({ error: 'Internal' }, 500));
    await app.request('/fail');
    expect(mockLog.error).toHaveBeenCalledWith('Request failed', expect.objectContaining({ status: 500 }));
  });

  it('includes method and path in log context', async () => {
    await app.request('/ok');
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'GET', path: '/ok' }),
    );
  });

  it('includes duration in log context', async () => {
    await app.request('/ok');
    const ctx = mockLog.debug.mock.calls[0][1] as { duration: number };
    expect(typeof ctx.duration).toBe('number');
    expect(ctx.duration).toBeGreaterThanOrEqual(0);
  });
});
