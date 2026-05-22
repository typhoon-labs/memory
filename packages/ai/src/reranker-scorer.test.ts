import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RerankerScorer } from './reranker-scorer';

/** Cast globalThis.fetch to a vitest Mock for stubbing. */
function fetchMock(): Mock {
  return globalThis.fetch as unknown as Mock;
}

describe('RerankerScorer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchResponse(body: unknown, status = 200) {
    fetchMock().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Bad Request',
      json: () => Promise.resolve(body),
      headers: new Headers(),
    });
  }

  it('sends correct request format with document objects', async () => {
    mockFetchResponse({ results: [{ index: 0, relevance_score: 0.85 }] });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'test-key', 'bedrock/cohere.rerank-v3-5:0');
    await scorer.getRelevanceScore('What is PTO?', 'PTO stands for paid time off.');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/v1/rerank',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        body: JSON.stringify({
          model: 'bedrock/cohere.rerank-v3-5:0',
          query: 'What is PTO?',
          documents: [{ text: 'PTO stands for paid time off.' }],
          top_n: 1,
        }),
      }),
    );
  });

  it('returns the relevance_score from the response', async () => {
    mockFetchResponse({ results: [{ index: 0, relevance_score: 0.92 }] });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const score = await scorer.getRelevanceScore('query', 'text');

    expect(score).toBe(0.92);
  });

  it('returns 0 when results array is empty', async () => {
    mockFetchResponse({ results: [] });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const score = await scorer.getRelevanceScore('query', 'text');

    expect(score).toBe(0);
  });

  it('returns 0 when results is undefined', async () => {
    mockFetchResponse({});

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const score = await scorer.getRelevanceScore('query', 'text');

    expect(score).toBe(0);
  });

  it('throws on non-OK response', async () => {
    mockFetchResponse({ error: 'Bad Request' }, 400);

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');

    await expect(scorer.getRelevanceScore('query', 'text')).rejects.toThrow('Rerank failed: 400 Bad Request');
  });

  it('batches concurrent calls into a single API request', async () => {
    mockFetchResponse({
      results: [
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.7 },
        { index: 2, relevance_score: 0.5 },
      ],
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const [s1, s2, s3] = await Promise.all([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
      scorer.getRelevanceScore('query', 'doc C'),
    ]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(s1).toBe(0.9);
    expect(s2).toBe(0.7);
    expect(s3).toBe(0.5);

    const body = JSON.parse(fetchMock().mock.calls[0][1].body);
    expect(body.documents).toEqual([{ text: 'doc A' }, { text: 'doc B' }, { text: 'doc C' }]);
    expect(body.top_n).toBe(3);
  });

  it('getMetrics returns metrics for the specific query', async () => {
    mockFetchResponse({
      results: [
        { index: 0, relevance_score: 0.9 },
        { index: 1, relevance_score: 0.7 },
      ],
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'my-model');
    expect(scorer.getMetrics('query')).toBeNull();

    await Promise.all([scorer.getRelevanceScore('query', 'doc A'), scorer.getRelevanceScore('query', 'doc B')]);

    const metrics = scorer.getMetrics('query');
    expect(metrics).toEqual(
      expect.objectContaining({
        model: 'my-model',
        documentCount: 2,
        resultCount: 2,
        topScore: 0.9,
      }),
    );
    expect(metrics?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('getMetrics returns null on second call (consume-once)', async () => {
    mockFetchResponse({ results: [{ index: 0, relevance_score: 0.8 }] });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    await scorer.getRelevanceScore('q', 'doc');

    expect(scorer.getMetrics('q')).not.toBeNull();
    expect(scorer.getMetrics('q')).toBeNull();
  });

  it('getMetrics isolates concurrent queries', async () => {
    let callCount = 0;
    fetchMock().mockImplementation(async () => {
      callCount++;
      const score = callCount === 1 ? 0.9 : 0.4;
      return {
        ok: true,
        json: () => Promise.resolve({ results: [{ index: 0, relevance_score: score }] }),
        headers: new Headers(),
      };
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    await Promise.all([scorer.getRelevanceScore('query A', 'doc 1'), scorer.getRelevanceScore('query B', 'doc 2')]);

    const metricsA = scorer.getMetrics('query A');
    const metricsB = scorer.getMetrics('query B');
    expect(metricsA).not.toBeNull();
    expect(metricsB).not.toBeNull();
    expect(metricsA?.topScore).not.toBe(metricsB?.topScore);
  });

  it('deprecated lastMetrics getter still works', async () => {
    mockFetchResponse({ results: [{ index: 0, relevance_score: 0.85 }] });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    await scorer.getRelevanceScore('q', 'doc');

    expect(scorer.lastMetrics).not.toBeNull();
    expect(scorer.lastMetrics?.topScore).toBe(0.85);
  });

  it('separates batches for different queries', async () => {
    let callCount = 0;
    fetchMock().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: () => Promise.resolve({ results: [{ index: 0, relevance_score: 0.8 }] }),
        headers: new Headers(),
      };
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    await Promise.all([scorer.getRelevanceScore('query A', 'doc 1'), scorer.getRelevanceScore('query B', 'doc 2')]);

    expect(callCount).toBe(2);
  });

  it('rejects all promises in batch on fetch error (no retries)', async () => {
    fetchMock().mockRejectedValue(new Error('Network error'));

    // maxRetries=0 to test immediate failure
    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model', 15_000, 0);
    const results = await Promise.allSettled([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  it('rejects all promises in batch on non-retryable response (400)', async () => {
    mockFetchResponse({}, 400);

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const results = await Promise.allSettled([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  it('rejects all promises on fetch timeout (no retries)', async () => {
    fetchMock().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    // timeoutMs=50, maxRetries=0 to test immediate timeout failure
    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model', 50, 0);
    const results = await Promise.allSettled([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  // ── Retry behavior ────────────────────────────────────────────────

  it('retries on 429 and succeeds', async () => {
    const mockFetch = fetchMock();
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests', headers: new Headers() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [{ index: 0, relevance_score: 0.8 }] }),
        headers: new Headers(),
      });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model', 15_000, 2, 10, 100);
    const score = await scorer.getRelevanceScore('query', 'doc');

    expect(score).toBe(0.8);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and succeeds', async () => {
    const mockFetch = fetchMock();
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error', headers: new Headers() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ results: [{ index: 0, relevance_score: 0.7 }] }),
        headers: new Headers(),
      });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model', 15_000, 2, 10, 100);
    const score = await scorer.getRelevanceScore('query', 'doc');

    expect(score).toBe(0.7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('extracts meta.billed_units.search_units from response', async () => {
    mockFetchResponse({
      results: [{ index: 0, relevance_score: 0.9 }],
      meta: { billed_units: { search_units: 5 } },
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    await scorer.getRelevanceScore('query', 'doc');

    const m = scorer.getMetrics('query');
    expect(m?.searchUnits).toBe(5);
  });

  it('rejects after all retries exhausted on 429', async () => {
    fetchMock().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers(),
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model', 15_000, 1, 10, 50);
    const results = await Promise.allSettled([scorer.getRelevanceScore('query', 'doc')]);

    expect(results[0].status).toBe('rejected');
    // Initial + 1 retry = 2 calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
