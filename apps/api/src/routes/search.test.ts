import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const { mockEmbed, mockQuery, mockHybridQuery, mockRefineResults, mockRerank } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockQuery: vi.fn(),
  mockHybridQuery: vi.fn(),
  mockRefineResults: vi.fn(),
  mockRerank: vi.fn(),
}));

vi.mock('ai', () => ({
  embed: mockEmbed,
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: () => 'mock-embedding-model',
  createRerankerModel: () => 'mock-reranker-model',
  EMBEDDING_MAX_CHARS: 50_000,
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
  rerank: mockRerank,
}));

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
});

// ── POST /v1/search/hybrid ───────────────────────────────────────────

describe('POST /v1/search/hybrid', () => {
  it('performs hybrid search with defaults (dedup=false, rerank=false)', async () => {
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

    // Verify hybridQuery
    expect(mockHybridQuery).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      queryText: 'how does PTO work?',
      queryVector: EMBEDDING,
      topK: 10,
    });

    // Verify refineResults called without dedup/reranker
    expect(mockRefineResults).toHaveBeenCalledWith([makeQueryResult()], 'how does PTO work?', {
      minScore: undefined,
      dedupKey: undefined,
      reranker: undefined,
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

  it('passes dedupKey when dedup=true', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', dedup: true }),
    });

    expect(res.status).toBe(200);
    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ dedupKey: 'documentId' }),
    );
  });

  it('passes reranker function when rerank=true', async () => {
    const res = await app.request('/v1/search/hybrid', {
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

  it('passes minScore as undefined when not provided', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({ minScore: undefined }),
    );
  });

  it('uses custom topK', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 25 }),
    });

    expect(mockHybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 25 }));
  });

  it('combines dedup and rerank together', async () => {
    await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', dedup: true, rerank: true }),
    });

    expect(mockRefineResults).toHaveBeenCalledWith(
      expect.anything(),
      'test',
      expect.objectContaining({
        dedupKey: 'documentId',
        reranker: expect.any(Function),
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

  it('rejects topK above 50', async () => {
    const res = await app.request('/v1/search/hybrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 51 }),
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
