import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api-fetch';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1', name: 'test' }));

    const result = await apiFetch<{ id: string; name: string }>('/api/test');
    expect(result).toEqual({ id: '1', name: 'test' });
    expect(mockFetch).toHaveBeenCalledWith('/api/test', { credentials: 'include' });
  });

  it('includes credentials by default', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await apiFetch('/api/test');
    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ credentials: 'include' }));
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await apiFetch('/api/test');
    expect(result).toBeUndefined();
  });

  it('throws ApiError with JSON error message on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Scorer not found' }, 404, 'Not Found'));

    try {
      await apiFetch('/api/test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.statusText).toBe('Not Found');
      expect(apiErr.message).toBe('Scorer not found');
    }
  });

  it('throws ApiError with JSON message field on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Rate limited' }, 429, 'Too Many Requests'));

    try {
      await apiFetch('/api/test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe('Rate limited');
    }
  });

  it('falls back to status text when response body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    try {
      await apiFetch('/api/test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toBe('500 Internal Server Error');
    }
  });

  it('falls back to status text when JSON has no error or message field', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ code: 'UNKNOWN' }, 400, 'Bad Request'));

    try {
      await apiFetch('/api/test');
      expect.unreachable('Should have thrown');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe('400 Bad Request');
    }
  });
});

describe('ApiError', () => {
  it('uses custom message when provided', () => {
    const err = new ApiError(400, 'Bad Request', 'Name is required');
    expect(err.message).toBe('Name is required');
    expect(err.status).toBe(400);
    expect(err.name).toBe('ApiError');
  });

  it('defaults to status + statusText when no message', () => {
    const err = new ApiError(500, 'Internal Server Error');
    expect(err.message).toBe('500 Internal Server Error');
  });
});
