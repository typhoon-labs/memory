import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockCreateVectorQueryTool,
  mockCreateEmbeddingModel,
  mockCreateRerankerModel,
  mockWithProgress,
  capturedLabels,
} = vi.hoisted(() => {
  const capturedLabels: { start?: string; done?: (output: unknown) => string } = {};
  return {
    mockCreateVectorQueryTool: vi.fn().mockReturnValue({ id: 'mock-inner-tool', execute: vi.fn() }),
    mockCreateEmbeddingModel: vi.fn().mockReturnValue('mock-embedding-model'),
    mockCreateRerankerModel: vi.fn().mockReturnValue('mock-reranker-model'),
    mockWithProgress: vi.fn().mockImplementation((tool, labels) => {
      capturedLabels.start = labels.start;
      capturedLabels.done = labels.done;
      return { ...tool, _progressLabels: labels };
    }),
    capturedLabels,
  };
});

vi.mock('@mastra/rag', () => ({
  createVectorQueryTool: mockCreateVectorQueryTool,
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: mockCreateEmbeddingModel,
  createRerankerModel: mockCreateRerankerModel,
}));

vi.mock('./with-progress', () => ({
  withProgress: mockWithProgress,
}));

// Import AFTER mocks
import { searchKnowledgeBase } from './search-kb';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchKnowledgeBase', () => {
  it('is defined', () => {
    expect(searchKnowledgeBase).toBeDefined();
  });

  it('createVectorQueryTool was called with correct config', () => {
    expect(mockCreateVectorQueryTool).toHaveBeenCalledWith(
      expect.objectContaining({
        vectorStoreName: 'pgVector',
        indexName: 'knowledge_base',
        model: 'mock-embedding-model',
        enableFilter: true,
        reranker: expect.objectContaining({
          model: expect.anything(),
          options: expect.objectContaining({
            weights: { semantic: 0.5, vector: 0.3, position: 0.2 },
            topK: 10,
          }),
        }),
        databaseConfig: {
          pgvector: { minScore: 0.5 },
        },
      }),
    );
  });

  it('withProgress was called with the tool and correct labels', () => {
    expect(mockWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mock-inner-tool' }),
      expect.objectContaining({
        start: 'Embedding query and searching the knowledge base…',
        done: expect.any(Function),
      }),
    );
  });

  it('done label returns count message for non-empty arrays', () => {
    expect(capturedLabels.done).toBeDefined();
    const done = capturedLabels.done as (output: unknown) => string;
    expect(done([1, 2, 3])).toBe('Returned 3 reranked chunks.');
    expect(done([1])).toBe('Returned 1 reranked chunks.');
    expect(done(Array.from({ length: 10 }))).toBe('Returned 10 reranked chunks.');
  });

  it('done label returns "No matching chunks found." for empty array', () => {
    expect(capturedLabels.done).toBeDefined();
    const done = capturedLabels.done as (output: unknown) => string;
    expect(done([])).toBe('No matching chunks found.');
  });

  it('done label returns "No matching chunks found." for non-array values', () => {
    expect(capturedLabels.done).toBeDefined();
    const done = capturedLabels.done as (output: unknown) => string;
    expect(done(null)).toBe('No matching chunks found.');
    expect(done(undefined)).toBe('No matching chunks found.');
    expect(done('string')).toBe('No matching chunks found.');
    expect(done(42)).toBe('No matching chunks found.');
  });
});
