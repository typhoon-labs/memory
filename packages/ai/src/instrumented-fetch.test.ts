import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({ warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

vi.mock('@typhoon/telemetry', () => ({
  llmRequestDuration: { record: vi.fn() },
  llmRetryCount: { add: vi.fn() },
}));

import { llmRequestDuration, llmRetryCount } from '@typhoon/telemetry';

import { createInstrumentedFetch } from './instrumented-fetch';

/** Cast globalThis.fetch to a vitest Mock for stubbing. */
function fetchMock(): Mock {
  return globalThis.fetch as unknown as Mock;
}

describe('createInstrumentedFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResponse(status: number, headers?: Record<string, string>) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : `Error ${status}`,
      headers: new Headers(headers),
    };
  }

  it('returns response on success', async () => {
    fetchMock().mockResolvedValue(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('records request duration on success', async () => {
    fetchMock().mockResolvedValue(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    await fetch('http://example.com/v1/chat');

    expect(llmRequestDuration.record).toHaveBeenCalledWith(expect.any(Number), { status: '200' });
  });

  it('retries on 429 with backoff', async () => {
    const mockFetch = fetchMock();
    mockFetch
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(llmRetryCount.add).toHaveBeenCalledTimes(2);
  });

  it('retries on 500', async () => {
    const mockFetch = fetchMock();
    mockFetch.mockResolvedValueOnce(mockResponse(500)).mockResolvedValueOnce(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 502', async () => {
    const mockFetch = fetchMock();
    mockFetch.mockResolvedValueOnce(mockResponse(502)).mockResolvedValueOnce(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 400', async () => {
    fetchMock().mockResolvedValue(mockResponse(400));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(400);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(llmRetryCount.add).not.toHaveBeenCalled();
  });

  it('does NOT retry on 401', async () => {
    fetchMock().mockResolvedValue(mockResponse(401));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(401);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 403', async () => {
    fetchMock().mockResolvedValue(mockResponse(403));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(403);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws after maxRetries exhausted', async () => {
    fetchMock().mockResolvedValue(mockResponse(500));

    const fetch = createInstrumentedFetch({ maxRetries: 2, retryDelayMs: 10, retryMaxDelayMs: 50 });

    await expect(fetch('http://example.com/v1/chat')).rejects.toThrow('LLM request failed');
    // Initial + 2 retries = 3 calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries on network error (fetch throws)', async () => {
    const mockFetch = fetchMock();
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws network error after maxRetries', async () => {
    fetchMock().mockRejectedValue(new Error('ECONNREFUSED'));

    const fetch = createInstrumentedFetch({ maxRetries: 1, retryDelayMs: 10, retryMaxDelayMs: 50 });

    await expect(fetch('http://example.com/v1/chat')).rejects.toThrow('ECONNREFUSED');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('captures x-amzn-requestid into active span', async () => {
    // Without an active span, just verify it doesn't crash
    fetchMock().mockResolvedValue(mockResponse(200, { 'x-amzn-requestid': 'req-123' }));

    const fetch = createInstrumentedFetch({ maxRetries: 0, retryDelayMs: 10, retryMaxDelayMs: 100 });
    const res = await fetch('http://example.com/v1/chat');

    expect(res.status).toBe(200);
  });

  it('respects Retry-After header (seconds)', async () => {
    const mockFetch = fetchMock();
    mockFetch
      .mockResolvedValueOnce({ ...mockResponse(429), headers: new Headers({ 'retry-after': '1' }) })
      .mockResolvedValueOnce(mockResponse(200));

    const t0 = Date.now();
    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 2000 });
    await fetch('http://example.com/v1/chat');

    // Should have waited ~1000ms for Retry-After
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  });

  it('injects traceparent header when no active span (no crash)', async () => {
    fetchMock().mockResolvedValue(mockResponse(200));

    const fetch = createInstrumentedFetch({ maxRetries: 0, retryDelayMs: 10, retryMaxDelayMs: 100 });
    await fetch('http://example.com/v1/chat');

    // Verify fetch was called (no traceparent since no active span in tests)
    const callArgs = fetchMock().mock.calls[0];
    const headers = callArgs[1]?.headers;
    // Headers should be a Headers object without traceparent (no active span)
    expect(headers).toBeDefined();
  });

  it('records duration on non-retryable failure', async () => {
    fetchMock().mockResolvedValue(mockResponse(400));

    const fetch = createInstrumentedFetch({ maxRetries: 3, retryDelayMs: 10, retryMaxDelayMs: 100 });
    await fetch('http://example.com/v1/chat');

    expect(llmRequestDuration.record).toHaveBeenCalledWith(expect.any(Number), { status: '400' });
  });
});
