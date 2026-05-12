import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const { mockEmbed, mockQuery, mockHybridQuery, mockRefineResults, mockRerankWithScorer } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockQuery: vi.fn(),
  mockHybridQuery: vi.fn(),
  mockRefineResults: vi.fn(),
  mockRerankWithScorer: vi.fn(),
}));

vi.mock('ai', () => ({
  embed: mockEmbed,
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: () => 'mock-embedding-model',
  createRerankerScorer: () => ({
    getRelevanceScore: vi.fn().mockResolvedValue(0.9),
    getMetrics: vi.fn().mockReturnValue(null),
  }),
  EMBEDDING_MAX_CHARS: 50_000,
  RAG_RERANK_WEIGHTS: { semantic: 1.0, vector: 0, position: 0 },
  RAG_RERANK_MIN_SCORE: 0.1,
  RAG_RERANK_CANDIDATES: 100,
  RAG_RERANK_CANDIDATES_EXPANDED: 200,
  RAG_VECTOR_MIN_SCORE: 0.6,
}));

vi.mock('@typhoon/db/drivers/pg', () => {
  const PgVectorClass = class PgVector {
    query = mockQuery;
    hybridQuery = mockHybridQuery;
  };
  return {
    PgVector: PgVectorClass,
    refineResults: mockRefineResults,
  };
});

vi.mock('@mastra/rag', () => ({
  rerankWithScorer: mockRerankWithScorer,
}));

vi.mock('@typhoon/telemetry', () => {
  const mockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
  };
  return {
    getTracer: () => ({
      startActiveSpan: vi.fn((_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan)),
    }),
    SpanStatusCode: { OK: 0, ERROR: 2 },
  };
});

vi.mock('../db', () => ({
  sql: {},
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function mountRoutes(
  routes: Array<{ path: string; method: string; middleware?: unknown[]; handler: (...args: never) => unknown }>,
) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    (app as any)[route.method.toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeQueryResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chunk-1',
    score: 0.85,
    metadata: {
      text: 'Some document text',
      documentId: 'doc-123',
      syncTargetId: 'sync-456',
      source: 's3://bucket/file.pdf',
      title: 'Test Document',
      startIndex: 42,
      ...((overrides.metadata as Record<string, unknown>) ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'metadata')),
  };
}

const EMBEDDING = [0.1, 0.2, 0.3];

// ── Tests ────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  vi.clearAllMocks();

  mockEmbed.mockResolvedValue({ embedding: EMBEDDING });
  mockQuery.mockResolvedValue([makeQueryResult()]);
  mockHybridQuery.mockResolvedValue([makeQueryResult()]);
  mockRefineResults.mockImplementation(async (results: unknown[]) => results);

  const { searchRoutes } = await import('./search');
  // biome-ignore lint/suspicious/noExplicitAny: test setup
  app = mountRoutes(searchRoutes as any);
});

// ── POST /v1/search ──────────────────────────────────────────────────

describe('POST /v1/search', () => {
  it('embeds the query, performs vector search, and maps results', async () => {
    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'how does PTO work?' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify embed was called with correct params
    expect(mockEmbed).toHaveBeenCalledWith({
      model: 'mock-embedding-model',
      value: 'how does PTO work?',
    });

    // Verify vector query was called
    expect(mockQuery).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      queryVector: EMBEDDING,
      topK: 10,
      minScore: 0.6,
    });

    // Verify result mapping
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
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 5, minScore: 0.8 }));
  });

  it('uses defaults for topK (10) and minScore (0.6)', async () => {
    await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 10, minScore: 0.6 }));
  });

  it('maps startIndex to null when absent', async () => {
    mockQuery.mockResolvedValue([
      {
        id: 'chunk-2',
        score: 0.9,
        metadata: { text: 'text', documentId: 'd1', syncTargetId: 's1', source: 'src', title: 'T' },
      },
    ]);

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    const json = await res.json();
    expect(json.results[0].metadata.startIndex).toBeNull();
  });

  it('maps text to empty string when absent', async () => {
    mockQuery.mockResolvedValue([{ id: 'chunk-3', score: 0.7, metadata: { documentId: 'd1' } }]);

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    const json = await res.json();
    expect(json.results[0].text).toBe('');
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

  it('returns 500 when embed throws', async () => {
    mockEmbed.mockRejectedValue(new Error('Embedding service down'));

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Embedding service down');
  });

  it('returns 500 when vector query throws', async () => {
    mockQuery.mockRejectedValue(new Error('Database connection lost'));

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Database connection lost');
  });

  it('returns generic message for non-Error throws', async () => {
    mockEmbed.mockRejectedValue('something unexpected');

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Search failed');
  });

  // ── Reranking ──

  it('passes through refineResults with reranker when rerank=true', async () => {
    mockRefineResults.mockResolvedValue([makeQueryResult()]);

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', rerank: true }),
    });

    expect(res.status).toBe(200);
    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ reranker: expect.any(Function) }),
    );
  });

  it('inflates retrieval topK when reranking', async () => {
    mockRefineResults.mockResolvedValue([makeQueryResult()]);

    await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 10, rerank: true }),
    });

    // topK=10 < RAG_RERANK_CANDIDATES=100, so retrieval uses 100
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 100 }));
  });

  it('skips minScore filtering on vector query when reranking', async () => {
    mockRefineResults.mockResolvedValue([makeQueryResult()]);

    await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', rerank: true }),
    });

    // minScore should be undefined to avoid pre-filtering before reranking
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ minScore: undefined }));
  });

  it('returns rerank metrics when rerank=true', async () => {
    mockRefineResults.mockResolvedValue([makeQueryResult()]);

    const res = await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', rerank: true }),
    });

    const json = await res.json();
    expect(json).toHaveProperty('rerank');
  });

  it('does not call refineResults when rerank=false (default)', async () => {
    await app.request('/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(mockRefineResults).not.toHaveBeenCalled();
  });
});

// ── POST /v1/search/hybrid ───────────────────────────────────────────

describe('POST /v1/search/hybrid', () => {
  it('performs hybrid search with defaults (dedup=true, rerank=true)', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'how does PTO work?' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    // Verify embed
    expect(mockEmbed).toHaveBeenCalledWith({
      model: 'mock-embedding-model',
      value: 'how does PTO work?',
    });

    // Verify hybridQuery — topK defaults to RAG_RERANK_CANDIDATES (100)
    expect(mockHybridQuery).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      queryText: 'how does PTO work?',
      queryVector: EMBEDDING,
      topK: 100,
    });

    // Verify refineResults called with dedup + reranker (defaults)
    expect(mockRefineResults).toHaveBeenCalledWith(
      [makeQueryResult()],
      'how does PTO work?',
      expect.objectContaining({
        dedupKey: 'documentId',
        reranker: expect.any(Function),
      }),
    );

    // Verify result mapping
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

  it('skips dedupKey when dedup=false', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', dedup: false }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ dedupKey: undefined }),
    );
  });

  it('does not pass reranker when rerank=false', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', rerank: false }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ reranker: undefined }),
    );
  });

  it('passes minScore when provided', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minScore: 0.75 }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ minScore: 0.75 }),
    );
  });

  it('uses RAG_RERANK_MIN_SCORE as default minScore when reranking', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ minScore: 0.1 }),
    );
  });

  it('uses custom topK when not reranking', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 25, rerank: false }),
    });

    expect(mockHybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 25 }));
  });

  it('inflates retrieval topK to RAG_RERANK_CANDIDATES when reranking', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 10 }),
    });

    // topK=10 < RAG_RERANK_CANDIDATES=100, so retrieval uses 100
    expect(mockHybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 100 }));
  });

  it('uses caller topK when larger than RAG_RERANK_CANDIDATES', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 150 }),
    });

    expect(mockHybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 150 }));
  });

  it('uses RAG_RERANK_CANDIDATES_EXPANDED when expanded=true', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', expanded: true }),
    });

    // expanded: topK defaults to RAG_RERANK_CANDIDATES_EXPANDED=200
    expect(mockHybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 200 }));
  });

  it('uses chunkId as dedupKey when expanded=true', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', expanded: true }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ dedupKey: 'chunkId' }),
    );
  });

  it('uses documentId as dedupKey when expanded=false (default)', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ dedupKey: 'documentId' }),
    );
  });

  it('disables both dedup and rerank when explicitly set to false', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', dedup: false, rerank: false }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({
        dedupKey: undefined,
        reranker: undefined,
      }),
    );
  });

  it('passes effectiveTopK to reranker', async () => {
    mockRefineResults.mockImplementation(
      async (
        _results: unknown[],
        _query: string,
        opts: { reranker?: (r: unknown[], q: string) => Promise<unknown[]> },
      ) => {
        if (opts.reranker) await opts.reranker([makeQueryResult()], 'test');
        return [];
      },
    );

    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 30 }),
    });

    expect(mockRerankWithScorer).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ topK: 30 }),
      }),
    );
  });

  it('maps results from refineResults output', async () => {
    mockRefineResults.mockResolvedValue([
      {
        id: 'refined-1',
        score: 0.95,
        metadata: {
          text: 'Refined text',
          documentId: 'doc-r1',
          syncTargetId: 'sync-r1',
          source: 's3://refined',
          title: 'Refined Doc',
          startIndex: 10,
        },
      },
    ]);

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    const json = await res.json();
    expect(json.results[0]).toEqual({
      text: 'Refined text',
      score: 0.95,
      metadata: {
        documentId: 'doc-r1',
        syncTargetId: 'sync-r1',
        source: 's3://refined',
        title: 'Refined Doc',
        startIndex: 10,
      },
    });
  });

  it('maps startIndex to null when absent in hybrid results', async () => {
    mockRefineResults.mockResolvedValue([
      {
        id: 'c1',
        score: 0.8,
        metadata: { text: 'txt', documentId: 'd1', syncTargetId: 's1', source: 'src', title: 'T' },
      },
    ]);

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    const json = await res.json();
    expect(json.results[0].metadata.startIndex).toBeNull();
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

  it('returns 500 when embed throws', async () => {
    mockEmbed.mockRejectedValue(new Error('Embedding failure'));

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Embedding failure');
  });

  it('returns 500 when hybridQuery throws', async () => {
    mockHybridQuery.mockRejectedValue(new Error('FTS index unavailable'));

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('FTS index unavailable');
  });

  it('returns 500 when refineResults throws', async () => {
    mockRefineResults.mockRejectedValue(new Error('Rerank model timeout'));

    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Rerank model timeout');
  });

  it('returns generic message for non-Error throws', async () => {
    mockEmbed.mockRejectedValue(42);

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
