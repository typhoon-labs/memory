import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockEmbed,
  mockRerankWithScorer,
  mockRefineResults,
  mockEmitToolProgress,
  mockCreateEmbeddingModel,
  mockCreateRerankerScorer,
} = vi.hoisted(() => {
  return {
    mockEmbed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
    mockRerankWithScorer: vi.fn().mockResolvedValue([]),
    mockRefineResults: vi.fn().mockResolvedValue([]),
    mockEmitToolProgress: vi.fn().mockResolvedValue(undefined),
    mockCreateEmbeddingModel: vi.fn().mockReturnValue('mock-embedding-model'),
    mockCreateRerankerScorer: vi.fn().mockReturnValue({
      getRelevanceScore: vi.fn().mockResolvedValue(0.9),
      getMetrics: vi.fn().mockReturnValue(null),
    }),
  };
});

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: unknown) => config,
}));

vi.mock('@mastra/rag', () => ({
  rerankWithScorer: mockRerankWithScorer,
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: mockCreateEmbeddingModel,
  createRerankerScorer: mockCreateRerankerScorer,
  EMBEDDING_MAX_CHARS: 2_000,
  RAG_RERANK_WEIGHTS: { semantic: 1.0, vector: 0, position: 0 },
  RAG_RERANK_MIN_SCORE: 0.1,
  RAG_RERANK_CANDIDATES: 100,
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  refineResults: mockRefineResults,
}));

vi.mock('ai', () => ({
  embed: mockEmbed,
}));

vi.mock('./with-progress', () => ({
  emitToolProgress: mockEmitToolProgress,
}));

// Import AFTER mocks
import { createHybridSearchTool, searchKnowledgeBaseHybrid } from './search-kb-hybrid';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    mastra: {
      getVector: vi.fn().mockReturnValue({
        hybridQuery: vi.fn().mockResolvedValue([]),
      }),
    },
    ...overrides,
  };
}

const execute = (input: Record<string, unknown>, ctx: unknown) =>
  (
    searchKnowledgeBaseHybrid as never as {
      execute: (
        i: unknown,
        c: unknown,
      ) => Promise<{
        sources: {
          id: string;
          metadata: Record<string, unknown>;
          score: number;
          document: string;
          vector: unknown[];
        }[];
      }>;
    }
  ).execute(input, ctx);

// ---------------------------------------------------------------------------
// Tests — default export (rerank: true)
// ---------------------------------------------------------------------------

describe('searchKnowledgeBaseHybrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct id and description', () => {
    expect(searchKnowledgeBaseHybrid.id).toBe('search_knowledge_base_hybrid');
    expect(searchKnowledgeBaseHybrid.description).toContain('keyword matching and semantic similarity');
  });

  it('rejects queryText exceeding embedding char limit', () => {
    const schema = searchKnowledgeBaseHybrid.inputSchema as any;
    const result = schema.safeParse({ queryText: 'x'.repeat(50_001), topK: 5 });
    expect(result.success).toBe(false);
  });

  it('throws when mastra context is missing', async () => {
    await expect(execute({ queryText: 'hello', topK: 5 }, {})).rejects.toThrow(
      'Mastra context required for hybrid search',
    );
  });

  it('throws when mastra is undefined on context', async () => {
    await expect(execute({ queryText: 'hello', topK: 5 }, { mastra: undefined })).rejects.toThrow(
      'Mastra context required for hybrid search',
    );
  });

  it('throws when vectorStore has no hybridQuery method', async () => {
    const ctx = {
      mastra: {
        getVector: vi.fn().mockReturnValue({}),
      },
    };
    await expect(execute({ queryText: 'hello', topK: 5 }, ctx)).rejects.toThrow(
      'pgVector store with hybridQuery not available',
    );
  });

  it('throws when vectorStore is null', async () => {
    const ctx = {
      mastra: {
        getVector: vi.fn().mockReturnValue(null),
      },
    };
    await expect(execute({ queryText: 'hello', topK: 5 }, ctx)).rejects.toThrow(
      'pgVector store with hybridQuery not available',
    );
  });

  it('returns empty sources when hybridQuery returns empty array', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    const result = await execute({ queryText: 'hello', topK: 5 }, ctx);

    expect(result).toEqual({ sources: [] });
  });

  it('calls embed with the embedding model and queryText', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await execute({ queryText: 'test query', topK: 5 }, ctx);

    expect(mockEmbed).toHaveBeenCalledWith({
      model: 'mock-embedding-model',
      value: 'test query',
    });
  });

  it('inflates retrieval topK to RAG_RERANK_CANDIDATES when reranking', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await execute({ queryText: 'test query', topK: 10 }, ctx);

    // topK=10 < RAG_RERANK_CANDIDATES=100, so retrieval uses 100
    expect(hybridQuery).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      queryText: 'test query',
      queryVector: [0.1, 0.2, 0.3],
      topK: 100,
    });
  });

  it('uses caller topK when larger than RAG_RERANK_CANDIDATES', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await execute({ queryText: 'test query', topK: 100 }, ctx);

    expect(hybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 100 }));
  });

  it('happy path: maps refined results to sources array', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'raw-1' }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    mockRefineResults.mockResolvedValue([
      { id: 'chunk-1', metadata: { text: 'hello world', title: 'Doc' }, score: 0.9 },
      { id: 'chunk-2', metadata: { text: 'foo bar', title: 'Doc 2' }, score: 0.8 },
    ]);

    const result = await execute({ queryText: 'test', topK: 5 }, ctx);

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toEqual({
      id: 'chunk-1',
      metadata: { text: 'hello world', title: 'Doc' },
      score: 0.9,
      document: 'hello world',
      vector: [],
    });
    expect(result.sources[1]).toEqual({
      id: 'chunk-2',
      metadata: { text: 'foo bar', title: 'Doc 2' },
      score: 0.8,
      document: 'foo bar',
      vector: [],
    });
  });

  it('sources have correct shape with id, metadata, score, document, vector', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'raw-1' }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    mockRefineResults.mockResolvedValue([{ id: 'chunk-1', metadata: { text: 'content' }, score: 0.85 }]);

    const result = await execute({ queryText: 'test', topK: 5 }, ctx);

    const source = result.sources[0];
    expect(source).toHaveProperty('id');
    expect(source).toHaveProperty('metadata');
    expect(source).toHaveProperty('score');
    expect(source).toHaveProperty('document');
    expect(source).toHaveProperty('vector');
    expect(source.vector).toEqual([]);
  });

  it('uses empty string as document when metadata.text is missing', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'raw-1' }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    mockRefineResults.mockResolvedValue([{ id: 'chunk-1', metadata: { title: 'No text' }, score: 0.85 }]);

    const result = await execute({ queryText: 'test', topK: 5 }, ctx);

    expect(result.sources[0].document).toBe('');
  });

  it('emitToolProgress is called with correct messages at each phase', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'raw-1' }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    mockRefineResults.mockResolvedValue([{ id: 'chunk-1', metadata: { text: 'content' }, score: 0.85 }]);

    await execute({ queryText: 'test', topK: 5 }, ctx);

    const calls = mockEmitToolProgress.mock.calls;

    expect(calls[0]).toEqual([ctx, 'Embedding query for hybrid search…']);
    expect(calls[1]).toEqual([ctx, 'Running hybrid keyword + vector search (topK=100)…']);
    expect(calls[2]).toEqual([ctx, 'Reranking 1 chunks…']);
    expect(calls[3]).toEqual([ctx, 'Returned 1 reranked chunks.', 'done']);
  });

  it('emits done with "No matching chunks found." when results are empty', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await execute({ queryText: 'test', topK: 5 }, ctx);

    expect(mockEmitToolProgress).toHaveBeenCalledWith(ctx, 'No matching chunks found.', 'done');
  });

  it('passes refineResults correct options', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'raw-1' }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    mockRefineResults.mockResolvedValue([]);

    await execute({ queryText: 'test', topK: 5 }, ctx);

    expect(mockRefineResults).toHaveBeenCalledWith(
      [{ id: 'raw-1' }],
      'test',
      expect.objectContaining({
        minScore: 0.1,
        dedupKey: 'chunkId',
        reranker: expect.any(Function),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — createHybridSearchTool({ rerank: false })
// ---------------------------------------------------------------------------

describe('createHybridSearchTool({ rerank: false })', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const noRerankTool = createHybridSearchTool({ rerank: false });

  const executeNoRerank = (input: Record<string, unknown>, ctx: unknown) =>
    (
      noRerankTool as never as {
        execute: (i: unknown, c: unknown) => Promise<{ sources: unknown[] }>;
      }
    ).execute(input, ctx);

  it('does not call refineResults when rerank is false', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'chunk-1', metadata: { text: 'hello' }, score: 0.8 }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await executeNoRerank({ queryText: 'test', topK: 5 }, ctx);

    expect(mockRefineResults).not.toHaveBeenCalled();
  });

  it('returns raw results without reranking', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([
      { id: 'chunk-1', metadata: { text: 'hello' }, score: 0.8 },
      { id: 'chunk-2', metadata: { text: 'world' }, score: 0.6 },
    ]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    const result = await executeNoRerank({ queryText: 'test', topK: 5 }, ctx);

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toEqual(expect.objectContaining({ id: 'chunk-1', score: 0.8 }));
  });

  it('still inflates retrieval to RAG_RERANK_CANDIDATES', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await executeNoRerank({ queryText: 'test', topK: 10 }, ctx);

    expect(hybridQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 100 }));
  });

  it('does not create a reranker scorer', () => {
    // The factory call itself should not create a scorer when rerank is false
    vi.clearAllMocks();
    createHybridSearchTool({ rerank: false });
    expect(mockCreateRerankerScorer).not.toHaveBeenCalled();
  });

  it('emits no-rerank done message', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([{ id: 'chunk-1', metadata: { text: 'hello' }, score: 0.8 }]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await executeNoRerank({ queryText: 'test', topK: 5 }, ctx);

    expect(mockEmitToolProgress).toHaveBeenCalledWith(ctx, 'Returned 1 chunks (no rerank).', 'done');
  });
});

// ---------------------------------------------------------------------------
// Tests — filter parameter
// ---------------------------------------------------------------------------

describe('searchKnowledgeBaseHybrid filter parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes filter through to hybridQuery when provided', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    const filter = { country: 'US' };
    await execute({ queryText: 'test', topK: 5, filter }, ctx);

    expect(hybridQuery).toHaveBeenCalledWith(expect.objectContaining({ filter: { country: 'US' } }));
  });

  it('passes filter as undefined when not provided', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await execute({ queryText: 'test', topK: 5 }, ctx);

    expect(hybridQuery).toHaveBeenCalledWith(expect.objectContaining({ filter: undefined }));
  });
});
