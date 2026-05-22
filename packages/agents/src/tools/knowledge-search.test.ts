import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any `vi.mock()` factories that
// reference them, per Vitest's hoisting rules.
// ---------------------------------------------------------------------------
const { mockEmitToolProgress, mockGenerateText, mockGetRelevanceScore, mockRerankWithScorer, mockRefineResults } =
  vi.hoisted(() => {
    const mockGetRelevanceScore = vi.fn().mockResolvedValue(0.9);
    return {
      mockEmitToolProgress: vi.fn().mockResolvedValue(undefined),
      mockGenerateText: vi.fn().mockResolvedValue({
        output: { answer: 'The answer [Source: 1].', citedRefs: ['1'] },
        usage: { promptTokens: 100, completionTokens: 50 },
      }),
      mockGetRelevanceScore,
      mockRerankWithScorer: vi.fn().mockResolvedValue([]),
      mockRefineResults: vi
        .fn()
        .mockImplementation(
          async (
            results: Array<{ id: string; metadata: Record<string, unknown>; score: number }>,
            _query: string,
            opts?: { reranker?: (r: unknown[], q: string) => Promise<unknown[]>; minScore?: number },
          ) => {
            // Simulate reranking: replace scores with mock scorer values
            let processed = results;
            if (opts?.reranker) {
              const scores = await Promise.all(results.map(() => mockGetRelevanceScore()));
              processed = results.map((r, i) => ({ ...r, score: scores[i] as number }));
            }
            // Apply minScore filter like the real implementation
            const minScore = opts?.minScore ?? 0;
            return processed.filter((r) => r.score >= minScore);
          },
        ),
    };
  });

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  Output: { object: vi.fn(() => ({})) },
}));

vi.mock('@typhoon/ai', () => ({
  createCitationModel: () => 'mock-citation-model',
  createRerankerScorer: () => ({
    getRelevanceScore: mockGetRelevanceScore,
    getMetrics: vi.fn().mockReturnValue(null),
  }),
  RAG_RERANK_MIN_SCORE: 0.1,
  RAG_KNOWLEDGE_MAX_RESULTS: 10,
}));

vi.mock('@mastra/rag', () => ({
  rerankWithScorer: mockRerankWithScorer,
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  refineResults: mockRefineResults,
}));

vi.mock('./with-progress', () => ({
  emitToolProgress: mockEmitToolProgress,
}));

// Import AFTER mocks are registered
import { createKnowledgeSearchTool } from './knowledge-search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the object returned by `knowledgeAgent.generate()`.
 * Each `sources` entry will be stored as-is on `result.sources` and the
 * tool code reads them via `result.sources[i]` → checks `s.id`, `s.score`,
 * `s.metadata.*`.
 *
 * The source extraction code does:
 *   const meta = (s.metadata ?? s) as Record<string, unknown>
 *   sources.push({ ..., chunkId: s.id, score: s.score, ... })
 *
 * So we pass objects where top-level fields map to what the tool expects
 * when there is no `metadata` key (i.e. `meta === s`).
 */
function makeRawSource(overrides: Record<string, unknown> = {}) {
  return {
    // These are read from `s` directly (not from `meta`)
    id: 'chunk-abc',
    score: 0.8,
    // These are read from `meta` (= `s` when no `metadata` key)
    title: 'Test Doc',
    section: 'Intro',
    text: 'Some text content',
    source: 's3/doc.pdf',
    documentId: 'doc-1',
    startIndex: 0,
    ...overrides,
  };
}

function makeSearchResult(rawSources: unknown[], toolName = 'searchKnowledgeBaseHybrid') {
  return {
    steps: [
      {
        toolResults: [
          {
            payload: {
              toolName,
              toolCallId: 'call-1',
              result: { sources: rawSources },
              args: {},
            },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mock knowledge agent and context factories
// ---------------------------------------------------------------------------

function makeMockAgent() {
  return {
    generate: vi.fn(),
    __registerMastra: vi.fn(),
  };
}

function makeMockContext(withVector = false) {
  const mockGetChunkIdByDocumentAndIndex = vi.fn().mockResolvedValue(null);
  const mockGetSyncTargetNames = vi.fn().mockResolvedValue(new Map());
  const vectorStore = withVector
    ? {
        sql: {},
        getChunkIdByDocumentAndIndex: mockGetChunkIdByDocumentAndIndex,
        getSyncTargetNames: mockGetSyncTargetNames,
      }
    : undefined;

  const ctx = {
    mastra: {
      __registerMastra: vi.fn(),
      getVector: vi.fn().mockReturnValue(vectorStore),
    },
    _mockGetChunkId: mockGetChunkIdByDocumentAndIndex,
  };
  return ctx;
}

type ToolResult = {
  text: string;
  _chunkSources?: {
    index: number;
    displayIndex: string;
    chunkId: string;
    title: string;
    section: string;
    text: string;
    source: string;
    documentId: string;
    startIndex: number;
    score: number;
    searchTool: string;
  }[];
};
const runTool = (tool: any, prompt: string, ctx: unknown): Promise<ToolResult> => tool.execute({ prompt }, ctx);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createKnowledgeSearchTool', () => {
  let mockAgent: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgent = makeMockAgent();
    // Default: generateText returns a single-source citation
    mockGenerateText.mockResolvedValue({
      output: { answer: 'The answer [Source: 1].', citedRefs: ['1'] },
      usage: { promptTokens: 100, completionTokens: 50 },
    });
    // Default: reranker returns high relevance
    mockGetRelevanceScore.mockResolvedValue(0.9);
  });

  // -------------------------------------------------------------------------
  // Source extraction
  // -------------------------------------------------------------------------

  describe('source extraction', () => {
    it('extracts sources from result.sources in tool results', async () => {
      const raw = makeRawSource();
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].chunkId).toBe('chunk-abc');
    });

    it('skips updateWorkingMemory tool results', async () => {
      const raw = makeRawSource();
      mockAgent.generate.mockResolvedValue({
        steps: [
          {
            toolResults: [
              {
                payload: {
                  toolName: 'updateWorkingMemory',
                  toolCallId: 'call-mem',
                  result: { sources: [raw] },
                  args: {},
                },
              },
              {
                payload: {
                  toolName: 'searchKnowledgeBaseHybrid',
                  toolCallId: 'call-search',
                  result: { sources: [makeRawSource({ id: 'chunk-xyz', title: 'Real Doc' })] },
                  args: {},
                },
              },
            ],
          },
        ],
      });
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      // Only the non-memory result should appear
      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].chunkId).toBe('chunk-xyz');
    });

    it('does not crash when result.sources is not an array', async () => {
      mockAgent.generate.mockResolvedValue({
        steps: [
          {
            toolResults: [
              {
                payload: {
                  toolName: 'searchKnowledgeBaseHybrid',
                  toolCallId: 'call-1',
                  result: { sources: 'not-an-array' },
                  args: {},
                },
              },
            ],
          },
        ],
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toContain('I could not find');
      expect(result._chunkSources).toBeUndefined();
    });

    it('does not crash when result.sources is null', async () => {
      mockAgent.generate.mockResolvedValue({
        steps: [
          {
            toolResults: [
              {
                payload: {
                  toolName: 'searchKnowledgeBaseHybrid',
                  toolCallId: 'call-1',
                  result: { sources: null },
                  args: {},
                },
              },
            ],
          },
        ],
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toContain('I could not find');
    });

    it('skips sources with no chunkId (no id field) during dedup', async () => {
      const rawWithId = makeRawSource({ id: 'chunk-real', score: 0.9 });
      const rawNoId = makeRawSource({ id: undefined, score: 0.9 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([rawWithId, rawNoId]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      // Only the one with an id survives dedup
      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].chunkId).toBe('chunk-real');
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  describe('deduplication by chunkId', () => {
    it('keeps the higher-scoring entry when same chunkId appears twice', async () => {
      const low = makeRawSource({ id: 'chunk-same', score: 0.5, section: 'Low' });
      const high = makeRawSource({ id: 'chunk-same', score: 0.9, section: 'High' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([low, high]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].score).toBe(0.9);
      expect(result._chunkSources?.[0].section).toBe('High');
    });

    it('keeps higher-scoring entry regardless of insertion order', async () => {
      const high = makeRawSource({ id: 'chunk-same', score: 0.9, section: 'High' });
      const low = makeRawSource({ id: 'chunk-same', score: 0.3, section: 'Low' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([high, low]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].score).toBe(0.9);
    });
  });

  // -------------------------------------------------------------------------
  // Score filtering
  // -------------------------------------------------------------------------

  describe('score filtering', () => {
    it('removes results when reranker scores below 0.1', async () => {
      mockGetRelevanceScore.mockResolvedValue(0.05);
      const low = makeRawSource({ id: 'chunk-low', score: 0.09 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([low]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toContain('I could not find');
      expect(result._chunkSources).toBeUndefined();
    });

    it('keeps results when reranker scores at exactly 0.1 (boundary)', async () => {
      mockGetRelevanceScore.mockResolvedValue(0.1);
      const boundary = makeRawSource({ id: 'chunk-boundary', score: 0.1 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([boundary]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
    });

    it('caps results at 10 maximum', async () => {
      const sources = Array.from({ length: 15 }, (_, i) =>
        makeRawSource({ id: `chunk-${i}`, score: 0.9 - i * 0.01, documentId: `doc-${i}` }),
      );
      mockAgent.generate.mockResolvedValue(makeSearchResult(sources));
      // Cite all 10 sources (1 through 10)
      mockGenerateText.mockResolvedValue({
        output: {
          answer:
            'Answer [Source: 1] [Source: 2] [Source: 3] [Source: 4] [Source: 5] [Source: 6] [Source: 7] [Source: 8] [Source: 9] [Source: 10].',
          citedRefs: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        },
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources?.length).toBeLessThanOrEqual(10);
    });
  });

  // -------------------------------------------------------------------------
  // Empty results path
  // -------------------------------------------------------------------------

  describe('empty results path', () => {
    it('returns fallback text and undefined _chunkSources when no results pass filter', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toBe('I could not find relevant information in the knowledge base to answer this question.');
      expect(result._chunkSources).toBeUndefined();
    });

    it('returns fallback when all reranker scores are below threshold', async () => {
      mockGetRelevanceScore.mockResolvedValue(0.05);
      const sources = [makeRawSource({ id: 'chunk-1', score: 0.05 }), makeRawSource({ id: 'chunk-2', score: 0.09 })];
      mockAgent.generate.mockResolvedValue(makeSearchResult(sources));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toContain('I could not find');
      expect(result._chunkSources).toBeUndefined();
    });

    it('does not call generateText when no results pass filter', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      expect(mockGenerateText).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Citation indexing
  // -------------------------------------------------------------------------

  describe('citation indexing', () => {
    it('assigns displayIndex "1" for a single chunk from one document', async () => {
      const raw = makeRawSource({ id: 'chunk-a', score: 0.9, documentId: 'doc-1' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].displayIndex).toBe('1');
    });

    it('assigns "1.1" and "1.2" for two chunks from the same document', async () => {
      const raw1 = makeRawSource({ id: 'chunk-a', score: 0.9, documentId: 'doc-1', section: 'Sec 1' });
      const raw2 = makeRawSource({ id: 'chunk-b', score: 0.85, documentId: 'doc-1', section: 'Sec 2' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw1, raw2]));
      mockGenerateText.mockResolvedValue({
        output: { answer: 'Answer [Source: 1.1] and [Source: 1.2].', citedRefs: ['1.1', '1.2'] },
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      const indices = result._chunkSources?.map((s) => s.displayIndex);
      expect(indices).toContain('1.1');
      expect(indices).toContain('1.2');
    });

    it('assigns "1" and "2" for single chunks from two different documents', async () => {
      const raw1 = makeRawSource({ id: 'chunk-a', score: 0.9, documentId: 'doc-1' });
      const raw2 = makeRawSource({ id: 'chunk-b', score: 0.85, documentId: 'doc-2' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw1, raw2]));
      mockGenerateText.mockResolvedValue({
        output: { answer: 'Answer [Source: 1] and [Source: 2].', citedRefs: ['1', '2'] },
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      const indices = result._chunkSources?.map((s) => s.displayIndex);
      expect(indices).toContain('1');
      expect(indices).toContain('2');
    });

    it('assigns "1.1", "1.2" for doc1 chunks and "2" for a solo doc2 chunk', async () => {
      const doc1a = makeRawSource({ id: 'chunk-a', score: 0.95, documentId: 'doc-1', section: 'A' });
      const doc1b = makeRawSource({ id: 'chunk-b', score: 0.9, documentId: 'doc-1', section: 'B' });
      const doc2 = makeRawSource({ id: 'chunk-c', score: 0.8, documentId: 'doc-2' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([doc1a, doc1b, doc2]));
      mockGenerateText.mockResolvedValue({
        output: { answer: 'Answer [Source: 1.1] [Source: 1.2] [Source: 2].', citedRefs: ['1.1', '1.2', '2'] },
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      const indices = result._chunkSources?.map((s) => s.displayIndex);
      expect(indices).toContain('1.1');
      expect(indices).toContain('1.2');
      expect(indices).toContain('2');
    });
  });

  // -------------------------------------------------------------------------
  // Citation reindexing
  // -------------------------------------------------------------------------

  describe('citation reindexing', () => {
    it('only includes cited chunks in _chunkSources', async () => {
      const raw1 = makeRawSource({ id: 'chunk-a', score: 0.9, documentId: 'doc-1' });
      const raw2 = makeRawSource({ id: 'chunk-b', score: 0.85, documentId: 'doc-2' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw1, raw2]));
      // LLM only cites source 1
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].chunkId).toBe('chunk-a');
    });

    it('renumbers sequential indices starting from 1 for cited refs', async () => {
      const doc1 = makeRawSource({ id: 'chunk-a', score: 0.95, documentId: 'doc-1' });
      const doc2 = makeRawSource({ id: 'chunk-b', score: 0.9, documentId: 'doc-2' });
      const doc3 = makeRawSource({ id: 'chunk-c', score: 0.85, documentId: 'doc-3' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([doc1, doc2, doc3]));
      // LLM cites source 3 only — should be reindexed to 1
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 3].', citedRefs: ['3'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(1);
      expect(result._chunkSources?.[0].index).toBe(1);
      expect(result._chunkSources?.[0].displayIndex).toBe('1');
    });

    it('rewrites [Source: X] markers in the text with new sequential indices', async () => {
      const doc1 = makeRawSource({ id: 'chunk-a', score: 0.95, documentId: 'doc-1' });
      const doc2 = makeRawSource({ id: 'chunk-b', score: 0.85, documentId: 'doc-2' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([doc1, doc2]));
      // LLM cites 2 first, then 1 — reindexing should reassign sequentially
      mockGenerateText.mockResolvedValue({
        output: { answer: 'See doc two [Source: 2]. Also doc one [Source: 1].', citedRefs: ['2', '1'] },
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      // Both sources cited; text should have [Source: N] markers rewritten
      expect(result.text).toMatch(/\[Source: \d+\]/);
      // _chunkSources should have 2 entries
      expect(result._chunkSources).toHaveLength(2);
    });

    it('handles multiple citations in one [Source: N, M] marker', async () => {
      const doc1 = makeRawSource({ id: 'chunk-a', score: 0.9, documentId: 'doc-1' });
      const doc2 = makeRawSource({ id: 'chunk-b', score: 0.85, documentId: 'doc-2' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([doc1, doc2]));
      mockGenerateText.mockResolvedValue({
        output: { answer: 'Combined answer [Source: 1, 2].', citedRefs: ['1', '2'] },
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toHaveLength(2);
      expect(result.text).toContain('[Source:');
    });
  });

  // -------------------------------------------------------------------------
  // Progress emission
  // -------------------------------------------------------------------------

  describe('progress emission', () => {
    it('emits "Searching" progress before calling knowledgeAgent.generate', async () => {
      const callOrder: string[] = [];
      mockEmitToolProgress.mockImplementation(async () => {
        callOrder.push('progress');
      });
      mockAgent.generate.mockImplementation(async () => {
        callOrder.push('generate');
        return makeSearchResult([]);
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      // First emitToolProgress call should precede generate
      expect(callOrder[0]).toBe('progress');
      expect(callOrder[1]).toBe('generate');
    });

    it('emits "Searching the knowledge base" message', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      expect(mockEmitToolProgress).toHaveBeenCalledWith(expect.anything(), 'Searching the knowledge base…');
    });

    it('emits "Composing" progress before calling generateText', async () => {
      const raw = makeRawSource({ id: 'chunk-a', score: 0.9 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const callOrder: string[] = [];
      mockEmitToolProgress.mockImplementation(async (_ctx: unknown, msg: string) => {
        callOrder.push(`progress:${msg}`);
      });
      mockGenerateText.mockImplementation(async () => {
        callOrder.push('generateText');
        return { output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } };
      });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      const composingIdx = callOrder.findIndex((c) => c.includes('Composing'));
      const generateIdx = callOrder.indexOf('generateText');
      expect(composingIdx).toBeGreaterThanOrEqual(0);
      expect(composingIdx).toBeLessThan(generateIdx);
    });

    it('emits "Composing answer with citations" message', async () => {
      const raw = makeRawSource({ id: 'chunk-a', score: 0.9 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      expect(mockEmitToolProgress).toHaveBeenCalledWith(expect.anything(), 'Composing answer with citations…');
    });

    it('does not emit Composing when no results pass filter', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      const composingCalls = mockEmitToolProgress.mock.calls.filter((c) => (c[1] as string).includes('Composing'));
      expect(composingCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Telemetry
  // -------------------------------------------------------------------------

  describe('telemetry', () => {
    it('passes experimental_telemetry to generateText', async () => {
      const raw = makeRawSource({ id: 'chunk-a', score: 0.9 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'citation-generation',
          },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Mastra registration
  // -------------------------------------------------------------------------

  describe('mastra registration', () => {
    it('calls __registerMastra on knowledge agent when context.mastra exists', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));
      const ctx = makeMockContext();

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', ctx);

      expect(mockAgent.__registerMastra).toHaveBeenCalledWith(ctx.mastra);
    });

    it('does not call __registerMastra when context has no mastra', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', {});

      expect(mockAgent.__registerMastra).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Graph ID resolution (numeric chunkId)
  // -------------------------------------------------------------------------

  describe('graph ID resolution', () => {
    it('resolves numeric chunkId via documentId::startIndex lookup in sources', async () => {
      // A hybrid result that provides the real ID mapping:
      const realSource = makeRawSource({
        id: 'real-chunk-id',
        score: 0.9,
        documentId: 'doc-1',
        startIndex: 42,
      });
      // A graph result with a fake numeric ID for the same doc/startIndex:
      const graphSource = makeRawSource({
        id: '99', // numeric fake ID from graph tool
        score: 0.95,
        documentId: 'doc-1',
        startIndex: 42,
      });

      mockAgent.generate.mockResolvedValue({
        steps: [
          {
            toolResults: [
              {
                payload: {
                  toolName: 'searchKnowledgeBaseHybrid',
                  toolCallId: 'call-1',
                  result: { sources: [realSource] },
                  args: {},
                },
              },
              {
                payload: {
                  toolName: 'searchKnowledgeBaseGraph',
                  toolCallId: 'call-2',
                  result: { sources: [graphSource] },
                  args: {},
                },
              },
            ],
          },
        ],
      });
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const ctx = makeMockContext(false);
      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', ctx);

      // After dedup, the graph source ('99') and real source ('real-chunk-id')
      // share the same documentId::startIndex. The graph ID resolution replaces
      // '99' with 'real-chunk-id', causing a second dedup pass to merge them.
      // With only citedRefs: ['1'], one source survives in _chunkSources.
      // Verify no numeric fake IDs survive in the final output.
      expect(result._chunkSources).toBeDefined();
      const numericIdChunks = result._chunkSources?.filter((s) => /^\d+$/.test(s.chunkId)) ?? [];
      expect(numericIdChunks).toHaveLength(0);
    });

    it('falls back to vector store query when lookup map misses', async () => {
      // Only a graph result with numeric ID, no real-ID counterpart in sources
      const graphSource = makeRawSource({
        id: '7',
        score: 0.9,
        documentId: 'doc-orphan',
        startIndex: 0,
      });
      mockAgent.generate.mockResolvedValue(makeSearchResult([graphSource]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const mockGetChunkId = vi.fn().mockResolvedValue('resolved-real-id');
      const ctx = {
        mastra: {
          __registerMastra: vi.fn(),
          getVector: vi.fn().mockReturnValue({
            sql: {},
            getChunkIdByDocumentAndIndex: mockGetChunkId,
            getSyncTargetNames: vi.fn().mockResolvedValue(new Map()),
          }),
        },
      };

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', ctx);

      expect(mockGetChunkId).toHaveBeenCalledWith('knowledge_base', 'doc-orphan', 0);
      const chunk = result._chunkSources?.find((s) => s.documentId === 'doc-orphan');
      expect(chunk).toBeDefined();
      expect(chunk?.chunkId).toBe('resolved-real-id');
    });

    it('leaves non-numeric chunkId unchanged', async () => {
      const raw = makeRawSource({ id: 'uuid-style-id', score: 0.9, documentId: 'doc-1' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const mockGetChunkId = vi.fn();
      const ctx = {
        mastra: {
          __registerMastra: vi.fn(),
          getVector: vi.fn().mockReturnValue({
            sql: {},
            getChunkIdByDocumentAndIndex: mockGetChunkId,
            getSyncTargetNames: vi.fn().mockResolvedValue(new Map()),
          }),
        },
      };

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', ctx);

      expect(mockGetChunkId).not.toHaveBeenCalled();
      expect(result._chunkSources?.[0].chunkId).toBe('uuid-style-id');
    });

    it('does not query vector store when context has no mastra', async () => {
      const graphSource = makeRawSource({ id: '5', score: 0.9, documentId: 'doc-1' });
      mockAgent.generate.mockResolvedValue(makeSearchResult([graphSource]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      // Pass a context with no mastra — should not crash
      const result = await runTool(tool, 'test', {});

      expect(result._chunkSources?.[0].chunkId).toBe('5');
    });
  });

  // -------------------------------------------------------------------------
  // Metadata context enrichment
  // -------------------------------------------------------------------------

  describe('metadata context enrichment', () => {
    it('prepends metadata context to prompt when getMetadataContext returns a string', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));
      const getMetadataContext = vi.fn().mockResolvedValue('country: us, eu | product: Pro, Basic');

      const tool = createKnowledgeSearchTool(mockAgent as never, { getMetadataContext });
      await runTool(tool, 'What is the return policy?', makeMockContext());

      expect(getMetadataContext).toHaveBeenCalled();
      const callArgs = mockAgent.generate.mock.calls[0][0] as string;
      expect(callArgs).toContain('What is the return policy?');
      expect(callArgs).toContain('Available metadata fields and values:');
      expect(callArgs).toContain('country: us, eu | product: Pro, Basic');
    });

    it('does not modify prompt when getMetadataContext returns undefined', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));
      const getMetadataContext = vi.fn().mockResolvedValue(undefined);

      const tool = createKnowledgeSearchTool(mockAgent as never, { getMetadataContext });
      await runTool(tool, 'test question', makeMockContext());

      const callArgs = mockAgent.generate.mock.calls[0][0] as string;
      expect(callArgs).toBe('test question');
    });

    it('silently continues with original prompt when getMetadataContext throws', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));
      const getMetadataContext = vi.fn().mockRejectedValue(new Error('DB connection failed'));

      const tool = createKnowledgeSearchTool(mockAgent as never, { getMetadataContext });
      await runTool(tool, 'test question', makeMockContext());

      const callArgs = mockAgent.generate.mock.calls[0][0] as string;
      expect(callArgs).toBe('test question');
    });

    it('does not call getMetadataContext when option is not provided', async () => {
      mockAgent.generate.mockResolvedValue(makeSearchResult([]));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test question', makeMockContext());

      const callArgs = mockAgent.generate.mock.calls[0][0] as string;
      expect(callArgs).toBe('test question');
    });
  });

  // -------------------------------------------------------------------------
  // Knowledge agent error handling
  // -------------------------------------------------------------------------

  describe('knowledge agent error handling', () => {
    it('returns fallback text when knowledgeAgent.generate throws', async () => {
      mockAgent.generate.mockRejectedValue(new Error('Chunks and embeddings arrays must not be empty'));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toBe('I could not find relevant information in the knowledge base to answer this question.');
    });

    it('returns undefined _chunkSources when knowledgeAgent.generate throws', async () => {
      mockAgent.generate.mockRejectedValue(new Error('Some agent error'));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources).toBeUndefined();
    });

    it('does not call generateText when knowledgeAgent.generate throws', async () => {
      mockAgent.generate.mockRejectedValue(new Error('agent crashed'));

      const tool = createKnowledgeSearchTool(mockAgent as never);
      await runTool(tool, 'test', makeMockContext());

      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('handles non-Error throws from knowledgeAgent.generate', async () => {
      mockAgent.generate.mockRejectedValue('string error');

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result.text).toContain('I could not find');
      expect(result._chunkSources).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Output structure
  // -------------------------------------------------------------------------

  describe('output structure', () => {
    it('returns text and _chunkSources when results exist', async () => {
      const raw = makeRawSource({ id: 'chunk-a', score: 0.9 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'The answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('_chunkSources');
      expect(typeof result.text).toBe('string');
    });

    it('_chunkSources entries have required shape', async () => {
      const raw = makeRawSource({ id: 'chunk-a', score: 0.9 });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      const src = result._chunkSources?.[0];
      expect(src).toMatchObject({
        index: expect.any(Number),
        displayIndex: expect.any(String),
        chunkId: expect.any(String),
        title: expect.any(String),
        section: expect.any(String),
        text: expect.any(String),
        source: expect.any(String),
        documentId: expect.any(String),
        startIndex: expect.any(Number),
        score: expect.any(Number),
        searchTool: expect.any(String),
      });
    });

    it('text field in _chunkSources is truncated to 200 chars', async () => {
      const longText = 'x'.repeat(500);
      const raw = makeRawSource({ id: 'chunk-long', score: 0.9, text: longText });
      mockAgent.generate.mockResolvedValue(makeSearchResult([raw]));
      mockGenerateText.mockResolvedValue({ output: { answer: 'Answer [Source: 1].', citedRefs: ['1'] } });

      const tool = createKnowledgeSearchTool(mockAgent as never);
      const result = await runTool(tool, 'test', makeMockContext());

      expect(result._chunkSources?.[0].text.length).toBeLessThanOrEqual(200);
    });
  });
});
