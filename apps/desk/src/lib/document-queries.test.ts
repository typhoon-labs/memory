import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentContentQuery, documentParsedQuery } from './document-queries';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('documentContentQuery', () => {
  it('returns correct query key for document id', () => {
    const opts = documentContentQuery('doc-123');
    expect(opts.queryKey).toEqual(['document-content', 'doc-123']);
  });

  it('sets staleTime to 5 minutes', () => {
    const opts = documentContentQuery('doc-123');
    expect(opts.staleTime).toBe(300_000);
  });

  it('fetches chunks endpoint with credentials', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ document: {}, chunks: [] }) });

    await documentContentQuery('doc-abc').queryFn();

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/documents/doc-abc/chunks', { credentials: 'include' });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    await expect(documentContentQuery('doc-abc').queryFn()).rejects.toThrow('404 Not Found');
  });

  it('returns parsed JSON on success', async () => {
    const data = { document: { id: 'doc-1' }, chunks: [{ text: 'hello', startIndex: 0 }] };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });

    const result = await documentContentQuery('doc-1').queryFn();
    expect(result).toEqual(data);
  });
});

describe('documentParsedQuery', () => {
  it('returns correct query key for document id', () => {
    const opts = documentParsedQuery('doc-456');
    expect(opts.queryKey).toEqual(['document-parsed', 'doc-456']);
  });

  it('sets staleTime to 5 minutes', () => {
    const opts = documentParsedQuery('doc-456');
    expect(opts.staleTime).toBe(300_000);
  });

  it('fetches parsed-content endpoint with credentials', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ text: 'content' }) });

    await documentParsedQuery('doc-xyz').queryFn();

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/documents/doc-xyz/parsed-content', { credentials: 'include' });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    await expect(documentParsedQuery('doc-xyz').queryFn()).rejects.toThrow('500 Internal Server Error');
  });

  it('returns parsed JSON on success', async () => {
    const data = { text: 'full document text' };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });

    const result = await documentParsedQuery('doc-1').queryFn();
    expect(result).toEqual(data);
  });
});
