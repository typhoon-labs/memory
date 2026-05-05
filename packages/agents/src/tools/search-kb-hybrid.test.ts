import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockEmbed,
  mockRerank,
  mockRefineResults,
  mockEmitToolProgress,
  mockCreateEmbeddingModel,
  mockCreateRerankerModel,
} = vi.hoisted(() => {
  return {
    mockEmbed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
    mockRerank: vi.fn().mockResolvedValue([]),
    mockRefineResults: vi.fn().mockResolvedValue([]),
    mockEmitToolProgress: vi.fn().mockResolvedValue(undefined),
    mockCreateEmbeddingModel: vi.fn().mockReturnValue('mock-embedding-model'),
    mockCreateRerankerModel: vi.fn().mockReturnValue('mock-reranker-model'),
  };
});

vi.mock('@mastra/core/tools', () => ({
  createTool: (config: unknown) => config,
}));

vi.mock('@mastra/rag', () => ({
  rerank: mockRerank,
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: mockCreateEmbeddingModel,
  createRerankerModel: mockCreateRerankerModel,
  EMBEDDING_MAX_CHARS: 50_000,
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
import { searchKnowledgeBaseHybrid } from './search-kb-hybrid';

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
// Tests
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
    // biome-ignore lint/suspicious/noExplicitAny: mock returns raw config, Zod schema has safeParse at runtime
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

  it('calls hybridQuery with correct params', async () => {
    const hybridQuery = vi.fn().mockResolvedValue([]);
    const ctx = makeContext();
    ctx.mastra.getVector.mockReturnValue({ hybridQuery });

    await execute({ queryText: 'test query', topK: 10 }, ctx);

    expect(hybridQuery).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      queryText: 'test query',
      queryVector: [0.1, 0.2, 0.3],
      topK: 10,
    });
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
    expect(calls[1]).toEqual([ctx, 'Running hybrid keyword + vector search (topK=5)…']);
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
        minScore: 0.25,
        dedupKey: 'chunkId',
        reranker: expect.any(Function),
      }),
    );
  });
});
