import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockCreateGraphRAGTool, mockCreateEmbeddingModel, mockWithProgress, capturedLabels } = vi.hoisted(() => {
  const capturedLabels: { start?: string; done?: (output: unknown) => string } = {};
  return {
    mockCreateGraphRAGTool: vi.fn().mockReturnValue({ id: 'mock-graph-tool', execute: vi.fn() }),
    mockCreateEmbeddingModel: vi.fn().mockReturnValue('mock-embedding-model'),
    mockWithProgress: vi.fn().mockImplementation((tool, labels) => {
      capturedLabels.start = labels.start;
      capturedLabels.done = labels.done;
      return { ...tool, _progressLabels: labels };
    }),
    capturedLabels,
  };
});

vi.mock('@mastra/rag', () => ({
  createGraphRAGTool: mockCreateGraphRAGTool,
}));

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: mockCreateEmbeddingModel,
  EMBEDDING_DIMENSION: 1536,
  RAG_GRAPH_THRESHOLD: 0.7,
}));

vi.mock('./with-progress', () => ({
  withProgress: mockWithProgress,
}));

// Import AFTER mocks
import { searchKnowledgeBaseGraph } from './graph-kb';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchKnowledgeBaseGraph', () => {
  it('is defined', () => {
    expect(searchKnowledgeBaseGraph).toBeDefined();
  });

  it('createGraphRAGTool was called with correct config', () => {
    expect(mockCreateGraphRAGTool).toHaveBeenCalledWith(
      expect.objectContaining({
        vectorStoreName: 'pgVector',
        indexName: 'knowledge_base',
        model: 'mock-embedding-model',
        enableFilter: true,
        graphOptions: {
          dimension: 1536,
          threshold: 0.7,
        },
      }),
    );
  });

  it('withProgress was called with correct labels', () => {
    expect(mockWithProgress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mock-graph-tool' }),
      expect.objectContaining({
        start: 'Walking the document graph for related context…',
        done: expect.any(Function),
      }),
    );
  });

  it('done label returns count message for non-empty arrays', () => {
    expect(capturedLabels.done).toBeDefined();
    const done = capturedLabels.done as (output: unknown) => string;
    expect(done([1, 2, 3])).toBe('Returned 3 connected chunks.');
    expect(done([1])).toBe('Returned 1 connected chunks.');
    expect(done(Array.from({ length: 7 }))).toBe('Returned 7 connected chunks.');
  });

  it('done label returns "No connected chunks found." for empty array', () => {
    expect(capturedLabels.done).toBeDefined();
    const done = capturedLabels.done as (output: unknown) => string;
    expect(done([])).toBe('No connected chunks found.');
  });

  it('done label returns "No connected chunks found." for non-array values', () => {
    expect(capturedLabels.done).toBeDefined();
    const done = capturedLabels.done as (output: unknown) => string;
    expect(done(null)).toBe('No connected chunks found.');
    expect(done(undefined)).toBe('No connected chunks found.');
    expect(done('string')).toBe('No connected chunks found.');
    expect(done(42)).toBe('No connected chunks found.');
  });
});
