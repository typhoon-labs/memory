import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────���────────────────────────────────────────────

const { mockVectorSearch, mockHybridSearch } = vi.hoisted(() => ({
  mockVectorSearch: vi.fn(),
  mockHybridSearch: vi.fn(),
}));

vi.mock('../services', () => ({
  getSearchService: () => ({
    vectorSearch: mockVectorSearch,
    hybridSearch: mockHybridSearch,
  }),
}));

vi.mock('@typhoon/services', () => ({
  isError: (result: unknown) =>
    result !== null && result !== undefined && typeof result === 'object' && 'error' in result,
}));

vi.mock('@typhoon/ai', () => ({
  EMBEDDING_MAX_CHARS: 2_000,
  RAG_RERANK_CANDIDATES: 100,
  RAG_RERANK_CANDIDATES_EXPANDED: 200,
  RAG_VECTOR_MIN_SCORE: 0.6,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Helpers ──────────────���───────────────────────────────────────────

function mountRoutes(
  routes: Array<{ path: string; method: string; middleware?: unknown[]; handler: (...args: never) => unknown }>,
) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[route.method.toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    text: 'Some document text',
    score: 0.85,
    metadata: {
      documentId: 'doc-123',
      syncTargetId: 'sync-456',
      source: 's3://bucket/file.pdf',
      title: 'Test Document',
      startIndex: 42,
      ...(overrides.metadata as Record<string, unknown>),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'metadata')),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  vi.clearAllMocks();

  mockVectorSearch.mockResolvedValue({ data: { results: [makeSearchResult()] } });
  mockHybridSearch.mockResolvedValue({ data: { results: [makeSearchResult()], rerank: undefined } });

  const { searchRoutes } = await import('./search');
  app = mountRoutes(searchRoutes as any);
});

// ── POST /v1/search ──��───────────────────────────────────────────────

describe('POST /v1/search', () => {
  it('calls vectorSearch with parsed input and returns results', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'how does PTO work?' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockVectorSearch).toHaveBeenCalledWith({
      query: 'how does PTO work?',
      topK: 10,
      minScore: 0.6,
      rerank: false,
    });

    expect(json.results).toHaveLength(1);
    expect(json.results[0]).toEqual({
      text: 'Some document text',
      score: 0.85,
      metadata: {
        documentId: 'doc-123',
        syncTargetId: 'sync-456',
        source: 's3://bucket/file.pdf',
        title: 'Test Document',
        startIndex: 42,
      },
    });
  });

  it('respects custom topK and minScore', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 5, minScore: 0.8 }),
    });

    expect(res.status).toBe(200);
    expect(mockVectorSearch).toHaveBeenCalledWith(expect.objectContaining({ topK: 5, minScore: 0.8 }));
  });

  it('uses defaults for topK (10) and minScore (0.6)', async () => {
    await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(mockVectorSearch).toHaveBeenCalledWith(expect.objectContaining({ topK: 10, minScore: 0.6 }));
  });

  it('passes rerank=true when specified', async () => {
    await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', rerank: true }),
    });

    expect(mockVectorSearch).toHaveBeenCalledWith(expect.objectContaining({ rerank: true }));
  });

  it('returns rerank metrics when service provides them', async () => {
    mockVectorSearch.mockResolvedValue({
      data: { results: [makeSearchResult()], rerank: { topScore: 0.95, durationMs: 42 } },
    });

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', rerank: true }),
    });

    const json = await res.json();
    expect(json.rerank).toEqual({ topScore: 0.95, durationMs: 42 });
  });

  // ── Validation ──

  it('rejects empty query', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(json.details).toBeDefined();
  });

  it('rejects missing query', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topK: 5 }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('rejects query exceeding embedding char limit', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'x'.repeat(50_001) }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('rejects topK below 1', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 0 }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('rejects topK above 50', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 51 }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('rejects non-integer topK', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 5.5 }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects minScore below 0', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minScore: -0.1 }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects minScore above 1', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minScore: 1.1 }),
    });

    expect(res.status).toBe(400);
  });

  // ── Error handling ──

  it('returns 500 when service returns error', async () => {
    mockVectorSearch.mockResolvedValue({ error: 'Embedding service down' });

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Embedding service down');
  });

  it('returns 500 when service returns generic error', async () => {
    mockVectorSearch.mockResolvedValue({ error: 'Search failed' });

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Search failed');
  });
});

// ── POST /v1/search/hybrid ──────────��────────────────────────────────

describe('POST /v1/search/hybrid', () => {
  it('performs hybrid search with defaults (dedup=true, rerank=true)', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'how does PTO work?' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(mockHybridSearch).toHaveBeenCalledWith({
      query: 'how does PTO work?',
      dedup: true,
      rerank: true,
      expanded: false,
    });

    expect(json.results).toHaveLength(1);
    expect(json.results[0]).toEqual({
      text: 'Some document text',
      score: 0.85,
      metadata: {
        documentId: 'doc-123',
        syncTargetId: 'sync-456',
        source: 's3://bucket/file.pdf',
        title: 'Test Document',
        startIndex: 42,
      },
    });
  });

  it('passes all options to the service', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 30, minScore: 0.75, dedup: false, rerank: false, expanded: true }),
    });

    expect(mockHybridSearch).toHaveBeenCalledWith({
      query: 'test',
      topK: 30,
      minScore: 0.75,
      dedup: false,
      rerank: false,
      expanded: true,
    });
  });

  it('returns rerank metrics from service', async () => {
    mockHybridSearch.mockResolvedValue({
      data: { results: [makeSearchResult()], rerank: { topScore: 0.9, durationMs: 55 } },
    });

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    const json = await res.json();
    expect(json.rerank).toEqual({ topScore: 0.9, durationMs: 55 });
  });

  // ── Validation ──

  it('rejects empty query', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(json.details).toBeDefined();
  });

  it('rejects missing query', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topK: 5 }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects query exceeding embedding char limit', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'x'.repeat(50_001) }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('rejects topK below 1', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 0 }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects topK above 500', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 501 }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects minScore below 0', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minScore: -0.5 }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects minScore above 1', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minScore: 2 }),
    });

    expect(res.status).toBe(400);
  });

  // ── Error handling ──

  it('returns 500 when service returns error', async () => {
    mockHybridSearch.mockResolvedValue({ error: 'FTS index unavailable' });

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('FTS index unavailable');
  });

  it('returns generic error message from service', async () => {
    mockHybridSearch.mockResolvedValue({ error: 'Search failed' });

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Search failed');
  });
});
