import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RerankerScorer } from './reranker-scorer';

describe('RerankerScorer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchResponse(body: unknown, status = 200) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Bad Request',
      json: () => Promise.resolve(body),
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

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
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
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      const score = callCount === 1 ? 0.9 : 0.4;
      return {
        ok: true,
        json: () => Promise.resolve({ results: [{ index: 0, relevance_score: score }] }),
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
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: () => Promise.resolve({ results: [{ index: 0, relevance_score: 0.8 }] }),
      };
    });

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    await Promise.all([scorer.getRelevanceScore('query A', 'doc 1'), scorer.getRelevanceScore('query B', 'doc 2')]);

    expect(callCount).toBe(2);
  });

  it('rejects all promises in batch on fetch error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const results = await Promise.allSettled([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  it('rejects all promises in batch on non-OK response', async () => {
    mockFetchResponse({}, 429);

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model');
    const results = await Promise.allSettled([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  it('rejects all promises on fetch timeout', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const scorer = new RerankerScorer('http://localhost:8787/v1', 'key', 'model', 50);
    const results = await Promise.allSettled([
      scorer.getRelevanceScore('query', 'doc A'),
      scorer.getRelevanceScore('query', 'doc B'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });
});
