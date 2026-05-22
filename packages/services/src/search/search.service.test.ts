import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOk } from '../test-helpers';

// ── Mocks ────────────────────────────────────────────────────────────

const { mockRefineResults } = vi.hoisted(() => ({
  mockRefineResults: vi.fn(),
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  refineResults: mockRefineResults,
}));

// ── Helpers ──────────────────────────────────────────────────────────

import type { SearchServiceDeps } from './search.service';
import { SearchService } from './search.service';

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
      ...(overrides.metadata as Record<string, unknown>),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'metadata')),
  };
}

const EMBEDDING = [0.1, 0.2, 0.3];

function createMockDeps(overrides: Partial<SearchServiceDeps> = {}): SearchServiceDeps {
  const mockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
  };

  return {
    vectorStore: {
      query: vi.fn().mockResolvedValue([makeQueryResult()]),
      hybridQuery: vi.fn().mockResolvedValue([makeQueryResult()]),
    } as never,
    tracer: {
      startActiveSpan: vi.fn((_name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan)),
    } as never,
    createEmbedding: vi.fn().mockResolvedValue(EMBEDDING),
    createReranker: vi.fn().mockReturnValue(vi.fn()),
    getRerankerMetrics: vi.fn().mockReturnValue(null),
    config: {
      rerankCandidates: 100,
      rerankCandidatesExpanded: 200,
      rerankMinScore: 0.1,
      vectorMinScore: 0.6,
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;
  let deps: SearchServiceDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefineResults.mockImplementation(async (results: unknown[]) => results);
    deps = createMockDeps();
    service = new SearchService(deps);
  });

  describe('vectorSearch', () => {
    it('embeds the query and performs vector search', async () => {
      const result = await service.vectorSearch({
        query: 'how does PTO work?',
        topK: 10,
        minScore: 0.6,
        rerank: false,
      });

      const data = assertOk(result);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].text).toBe('Some document text');
      expect(data.results[0].metadata.documentId).toBe('doc-123');

      expect(deps.createEmbedding).toHaveBeenCalledWith('how does PTO work?');
      expect((deps.vectorStore as never as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledWith({
        indexName: 'knowledge_base',
        queryVector: EMBEDDING,
        topK: 10,
        minScore: 0.6,
      });
    });

    it('inflates retrieval topK when reranking', async () => {
      mockRefineResults.mockResolvedValue([makeQueryResult()]);
      await service.vectorSearch({ query: 'test', topK: 10, minScore: 0.6, rerank: true });

      expect((deps.vectorStore as never as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 100 }),
      );
    });

    it('skips minScore on vector query when reranking', async () => {
      mockRefineResults.mockResolvedValue([makeQueryResult()]);
      await service.vectorSearch({ query: 'test', topK: 10, minScore: 0.6, rerank: true });

      expect((deps.vectorStore as never as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledWith(
        expect.objectContaining({ minScore: undefined }),
      );
    });

    it('returns error when embedding fails', async () => {
      (deps.createEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Embedding service down'));

      const result = await service.vectorSearch({ query: 'test', topK: 10, minScore: 0.6, rerank: false });

      expect(result).toEqual({ error: 'Embedding service down' });
    });

    it('returns generic error for non-Error throws', async () => {
      (deps.createEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue('something unexpected');

      const result = await service.vectorSearch({ query: 'test', topK: 10, minScore: 0.6, rerank: false });

      expect(result).toEqual({ error: 'Search failed' });
    });

    it('maps startIndex to null when absent', async () => {
      (deps.vectorStore as never as { query: ReturnType<typeof vi.fn> }).query.mockResolvedValue([
        { id: 'c1', score: 0.9, metadata: { text: 'text', documentId: 'd1' } },
      ]);

      const result = await service.vectorSearch({ query: 'test', topK: 10, minScore: 0.6, rerank: false });

      const data = assertOk(result);
      expect(data.results[0].metadata.startIndex).toBeNull();
    });
  });

  describe('hybridSearch', () => {
    it('performs hybrid search with defaults', async () => {
      const result = await service.hybridSearch({ query: 'test', dedup: true, rerank: true, expanded: false });

      const data = assertOk(result);
      expect(data.results).toHaveLength(1);

      expect(deps.createEmbedding).toHaveBeenCalledWith('test');
      expect((deps.vectorStore as never as { hybridQuery: ReturnType<typeof vi.fn> }).hybridQuery).toHaveBeenCalledWith(
        {
          indexName: 'knowledge_base',
          queryText: 'test',
          queryVector: EMBEDDING,
          topK: 100,
        },
      );
    });

    it('uses expanded candidates when expanded=true', async () => {
      await service.hybridSearch({ query: 'test', dedup: true, rerank: true, expanded: true });

      expect((deps.vectorStore as never as { hybridQuery: ReturnType<typeof vi.fn> }).hybridQuery).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 200 }),
      );
    });

    it('passes chunkId dedupKey when expanded', async () => {
      await service.hybridSearch({ query: 'test', dedup: true, rerank: true, expanded: true });

      expect(mockRefineResults).toHaveBeenCalledWith(
        expect.anything(),
        'test',
        expect.objectContaining({ dedupKey: 'chunkId' }),
      );
    });

    it('passes documentId dedupKey when not expanded', async () => {
      await service.hybridSearch({ query: 'test', dedup: true, rerank: true, expanded: false });

      expect(mockRefineResults).toHaveBeenCalledWith(
        expect.anything(),
        'test',
        expect.objectContaining({ dedupKey: 'documentId' }),
      );
    });

    it('skips dedup when dedup=false', async () => {
      await service.hybridSearch({ query: 'test', dedup: false, rerank: true, expanded: false });

      expect(mockRefineResults).toHaveBeenCalledWith(
        expect.anything(),
        'test',
        expect.objectContaining({ dedupKey: undefined }),
      );
    });

    it('skips reranker when rerank=false', async () => {
      await service.hybridSearch({ query: 'test', dedup: true, rerank: false, expanded: false });

      expect(mockRefineResults).toHaveBeenCalledWith(
        expect.anything(),
        'test',
        expect.objectContaining({ reranker: undefined }),
      );
    });

    it('returns error when embedding fails', async () => {
      (deps.createEmbedding as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Embedding failure'));

      const result = await service.hybridSearch({ query: 'test', dedup: true, rerank: true, expanded: false });

      expect(result).toEqual({ error: 'Embedding failure' });
    });
  });
});
