import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startHealthServer } from './health';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startHealthServer', () => {
  const mockServe = vi.fn();

  beforeEach(() => {
    mockServe.mockReset();
    vi.stubGlobal('Bun', { serve: mockServe });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls Bun.serve with the correct port', () => {
    startHealthServer(8080);

    expect(mockServe).toHaveBeenCalledTimes(1);
    const config = mockServe.mock.calls[0][0];
    expect(config.port).toBe(8080);
    expect(config.hostname).toBe('0.0.0.0');
  });

  it('default port is 5170', () => {
    startHealthServer();

    const config = mockServe.mock.calls[0][0];
    expect(config.port).toBe(5170);
  });

  it('fetch handler returns 200 for GET /healthz', async () => {
    startHealthServer();

    const config = mockServe.mock.calls[0][0];
    const fetchHandler = config.fetch;
    const req = new Request('http://localhost:5170/healthz', { method: 'GET' });
    const res = fetchHandler(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('fetch handler returns 404 for other paths', async () => {
    startHealthServer();

    const config = mockServe.mock.calls[0][0];
    const fetchHandler = config.fetch;
    const req = new Request('http://localhost:5170/other', { method: 'GET' });
    const res = fetchHandler(req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
  });

  it('fetch handler returns 404 for non-GET methods on /healthz', async () => {
    startHealthServer();

    const config = mockServe.mock.calls[0][0];
    const fetchHandler = config.fetch;
    const req = new Request('http://localhost:5170/healthz', { method: 'POST' });
    const res = fetchHandler(req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('not found');
  });

  it('fetch handler returns 404 for PUT on /healthz', async () => {
    startHealthServer();

    const config = mockServe.mock.calls[0][0];
    const fetchHandler = config.fetch;
    const req = new Request('http://localhost:5170/healthz', { method: 'PUT' });
    const res = fetchHandler(req);

    expect(res.status).toBe(404);
  });
});
