import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: vi.fn(),
  createExtractionModel: vi.fn(),
  EMBEDDING_MAX_CHARS: 50_000,
  EMBEDDING_MAX_TOKENS: 8_192,
}));
vi.mock('ai', () => ({
  embed: vi.fn(async () => ({ embedding: [0.1, 0.2] })),
  generateText: vi.fn(async () => ({ text: 'Title\nDescription' })),
}));
vi.mock('@typhoon/telemetry', () => ({
  SpanStatusCode: { OK: 0, ERROR: 2 },
  getTracer: () => ({
    startActiveSpan: (_name: string, ...args: unknown[]) => {
      const mockSpan = {
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      };
      // Handle both (name, fn) and (name, opts, fn) signatures
      const fn = typeof args[0] === 'function' ? args[0] : args[1];
      return (fn as (span: unknown) => unknown)(mockSpan);
    },
  }),
  chunkSizeChars: { record: vi.fn() },
  embedRetryCount: { add: vi.fn() },
  embedTokenUsage: { record: vi.fn() },
  syncStageDuration: { record: vi.fn() },
}));
vi.mock('@mastra/rag', () => {
  class MockMDocument {
    static fromText = vi.fn(() => new MockMDocument());
    static fromHTML = vi.fn(() => new MockMDocument());
    static fromMarkdown = vi.fn(() => new MockMDocument());
    static fromJSON = vi.fn(() => new MockMDocument());
    chunk = vi.fn(async () => [{ text: 'chunk1', metadata: {} }]);
  }
  return { MDocument: MockMDocument };
});

import { embed, generateText } from 'ai';
import {
  buildChunkOptions,
  deleteDocumentVectors,
  EMBEDDING_MAX_CHARS,
  enforceChunkSizeLimit,
  generateDocumentMetadata,
  makeChunkId,
  processFile,
  TokenRatioTracker,
  updateDocumentVectorSource,
} from './pipeline';

describe('buildChunkOptions', () => {
  const extract = { keywords: { llm: {}, keywords: 5 } };

  it('returns semantic-markdown strategy for markdown with maxSize', () => {
    const opts = buildChunkOptions('markdown', extract);
    expect(opts.strategy).toBe('semantic-markdown');
    expect(opts).toHaveProperty('joinThreshold', 500);
    expect(opts).toHaveProperty('maxSize', EMBEDDING_MAX_CHARS);
    expect(opts).toHaveProperty('overlap', 50);
    expect(opts).toHaveProperty('addStartIndex', true);
    expect(opts).toHaveProperty('extract', extract);
  });

  it('returns html strategy for html with maxSize for Titan V2 compliance', () => {
    const opts = buildChunkOptions('html', extract);
    expect(opts.strategy).toBe('html');
    expect(opts).toHaveProperty('headers');
    const htmlOpts = opts as { headers: [string, string][]; maxSize: number; overlap: number };
    expect(htmlOpts.headers).toEqual([
      ['h1', 'title'],
      ['h2', 'section'],
      ['h3', 'subsection'],
    ]);
    expect(htmlOpts.maxSize).toBe(EMBEDDING_MAX_CHARS);
    expect(htmlOpts.overlap).toBe(200);
    expect(opts).toHaveProperty('addStartIndex', true);
  });

  it('returns token strategy for json', () => {
    const opts = buildChunkOptions('json', extract);
    expect(opts.strategy).toBe('token');
    expect(opts).toHaveProperty('maxSize', 512);
    expect(opts).toHaveProperty('overlap', 50);
  });

  it('returns sentence strategy for text (default)', () => {
    const opts = buildChunkOptions('text', extract);
    expect(opts.strategy).toBe('sentence');
    expect(opts).toHaveProperty('maxSize', 512);
    expect(opts).toHaveProperty('overlap', 50);
  });

  it('returns sentence strategy for unknown format', () => {
    const opts = buildChunkOptions('unknown-format', extract);
    expect(opts.strategy).toBe('sentence');
  });
});

describe('deleteDocumentVectors', () => {
  it('calls vectorStore.deleteVectors with correct params', async () => {
    const vectorStore = {
      deleteVectors: vi.fn(async () => {}),
    };
    await deleteDocumentVectors(vectorStore as never, 'doc-123');
    expect(vectorStore.deleteVectors).toHaveBeenCalledWith({
      indexName: 'knowledge_base',
      filter: { documentId: 'doc-123' },
    });
  });
});

describe('updateDocumentVectorSource', () => {
  it('calls sqlInstance.unsafe with correct SQL and params', async () => {
    const unsafeFn = vi.fn(async () => {});
    const sqlInstance = { unsafe: unsafeFn };
    await updateDocumentVectorSource(sqlInstance as never, 'doc-123', 'new-source-key');
    expect(unsafeFn).toHaveBeenCalledTimes(1);
    const [sql, params] = unsafeFn.mock.calls[0];
    expect(sql).toContain('UPDATE "knowledge_base"');
    expect(sql).toContain('jsonb_set');
    expect(params).toEqual(['doc-123', 'new-source-key']);
  });
});

describe('generateDocumentMetadata', () => {
  it('extracts title and description from two-line response', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'My Document Title\nThis is a description of the document.',
    } as never);
    const result = await generateDocumentMetadata('Sample text content', {} as never);
    expect(result.title).toBe('My Document Title');
    expect(result.description).toBe('This is a description of the document.');
  });

  it('returns Untitled for empty response', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: '' } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.title).toBe('Untitled');
    expect(result.description).toBe('');
  });

  it('strips markdown heading prefix from title', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: '## My Title\nDescription here' } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.title).toBe('My Title');
  });

  it('handles single line response', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: 'Just a title' } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.title).toBe('Just a title');
    expect(result.description).toBe('');
  });

  it('uses first 2000 chars as sample', async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce({ text: 'Title\nDesc' } as never);
    const longText = 'x'.repeat(5000);
    await generateDocumentMetadata(longText, {} as never);
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toHaveLength(2000);
  });
});

describe('processFile', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('returns chunkCount 0 for empty content', async () => {
    const result = await processFile(
      {
        content: Buffer.from(''),
        filename: 'empty.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'empty.txt',
      },
      vectorStore as never,
    );
    expect(result).toEqual({ chunkCount: 0, title: null, description: null });
  });

  it('returns chunkCount 0 for whitespace-only content', async () => {
    const result = await processFile(
      {
        content: Buffer.from('   \n  \t  '),
        filename: 'blank.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'blank.txt',
      },
      vectorStore as never,
    );
    expect(result).toEqual({ chunkCount: 0, title: null, description: null });
  });

  it('processes text file and returns chunk count', async () => {
    const result = await processFile(
      {
        content: Buffer.from('Hello world. This is a test document.'),
        filename: 'test.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'test.txt',
      },
      vectorStore as never,
    );
    expect(result.chunkCount).toBe(1);
    expect(result.title).toBeDefined();
  });

  it('calls onStage callback for each stage', async () => {
    const onStage = vi.fn();
    await processFile(
      {
        content: Buffer.from('Content for staging test.'),
        filename: 'stage.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'stage.txt',
        onStage,
      },
      vectorStore as never,
    );
    const stages = onStage.mock.calls.map((c) => c[0]);
    expect(stages).toContain('chunk');
    expect(stages).toContain('metadata');
    expect(stages).toContain('embed');
    expect(stages).toContain('upsert');
  });

  it('calls vectorStore.upsert with knowledge_base index, deterministic ids, and section metadata', async () => {
    vectorStore.upsert.mockClear();
    await processFile(
      {
        content: Buffer.from('Content for upsert test.'),
        filename: 'upsert.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'upsert.txt',
      },
      vectorStore as never,
    );
    const call = vectorStore.upsert.mock.calls[0][0];
    expect(call.indexName).toBe('knowledge_base');
    // Deterministic IDs should be passed
    expect(call.ids).toBeDefined();
    expect(call.ids).toHaveLength(1);
    expect(typeof call.ids[0]).toBe('string');
    expect(call.ids[0]).toHaveLength(32); // sha256 hex truncated to 32 chars
    // Metadata should include section field
    expect(call.metadata[0]).toHaveProperty('section');
  });
});

describe('makeChunkId', () => {
  it('produces a 32-char hex string', () => {
    const id = makeChunkId('doc-1', 100, 'Some chunk text');
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic — same input produces same output', () => {
    const a = makeChunkId('doc-1', 100, 'text');
    const b = makeChunkId('doc-1', 100, 'text');
    expect(a).toBe(b);
  });

  it('differs when documentId changes', () => {
    const a = makeChunkId('doc-1', 100, 'text');
    const b = makeChunkId('doc-2', 100, 'text');
    expect(a).not.toBe(b);
  });

  it('differs when startIndex changes', () => {
    const a = makeChunkId('doc-1', 100, 'text');
    const b = makeChunkId('doc-1', 200, 'text');
    expect(a).not.toBe(b);
  });

  it('differs when text changes', () => {
    const a = makeChunkId('doc-1', 100, 'text A');
    const b = makeChunkId('doc-1', 100, 'text B');
    expect(a).not.toBe(b);
  });

  it('handles null startIndex', () => {
    const id = makeChunkId('doc-1', null, 'text');
    expect(id).toHaveLength(32);
  });
});

describe('enforceChunkSizeLimit', () => {
  const meta = { documentId: 'doc-1', source: 'test' };
  const maxChars = 100;

  it('passes through chunks under the limit unchanged', () => {
    const chunks = [
      { text: 'short chunk', metadata: { ...meta } },
      { text: 'another short one', metadata: { ...meta } },
    ];
    const result = enforceChunkSizeLimit(chunks, maxChars);
    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('short chunk');
    expect(result[1]?.text).toBe('another short one');
  });

  it('passes through a chunk exactly at the limit', () => {
    const text = 'x'.repeat(maxChars);
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], maxChars);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(text);
  });

  it('splits oversized chunks at paragraph boundaries', () => {
    const para1 = 'a'.repeat(40);
    const para2 = 'b'.repeat(40);
    const para3 = 'c'.repeat(40);
    const text = `${para1}\n\n${para2}\n\n${para3}`;
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], maxChars);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('splits at sentence boundaries when no paragraphs', () => {
    const s1 = `${'a'.repeat(40)}.`;
    const s2 = `${'b'.repeat(40)}.`;
    const s3 = `${'c'.repeat(40)}.`;
    const text = `${s1} ${s2} ${s3}`;
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], maxChars);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('hard-splits when no paragraph or sentence boundaries', () => {
    const text = 'x'.repeat(250);
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], maxChars);
    expect(result).toHaveLength(3);
    expect(result[0]?.text).toHaveLength(100);
    expect(result[1]?.text).toHaveLength(100);
    expect(result[2]?.text).toHaveLength(50);
  });

  it('preserves metadata on each sub-chunk', () => {
    const text = `${'a'.repeat(40)}\n\n${'b'.repeat(40)}\n\n${'c'.repeat(40)}`;
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], maxChars);
    for (const chunk of result) {
      expect(chunk.metadata).toEqual(meta);
    }
  });

  it('handles mix of small and oversized chunks', () => {
    const chunks = [
      { text: 'small', metadata: { ...meta } },
      { text: 'x'.repeat(250), metadata: { ...meta } },
      { text: 'also small', metadata: { ...meta } },
    ];
    const result = enforceChunkSizeLimit(chunks, maxChars);
    expect(result[0]?.text).toBe('small');
    expect(result[result.length - 1]?.text).toBe('also small');
    expect(result.length).toBe(5); // 1 + 3 splits + 1
  });

  it('splits chunks exceeding the model hard limit (50K chars)', () => {
    const text = 'x'.repeat(55_000);
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], EMBEDDING_MAX_CHARS);
    expect(result.length).toBe(2);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(EMBEDDING_MAX_CHARS);
    }
  });

  it('does not include empty or whitespace-only chunks in filtered results', () => {
    const chunks = [
      { text: 'valid chunk', metadata: { ...meta } },
      { text: '', metadata: { ...meta } },
      { text: '   \n  ', metadata: { ...meta } },
      { text: 'another valid', metadata: { ...meta } },
    ];
    const result = enforceChunkSizeLimit(chunks, maxChars).filter((c) => c.text.trim());
    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('valid chunk');
    expect(result[1]?.text).toBe('another valid');
  });
});

describe('TokenRatioTracker', () => {
  it('returns Infinity when no data recorded', () => {
    const tracker = new TokenRatioTracker();
    expect(tracker.safeMaxChars(8192)).toBe(Number.POSITIVE_INFINITY);
    expect(tracker.hasData).toBe(false);
    expect(tracker.ratio).toBeNull();
  });

  it('computes safe max chars from measured ratio', () => {
    const tracker = new TokenRatioTracker();
    // 4000 chars / 1000 tokens = 4 chars/token
    tracker.record(4000, 1000);
    // safeMax = 8192 * 4 * 0.9 = 29491.2 → 29491
    expect(tracker.safeMaxChars(8192)).toBe(29491);
    expect(tracker.hasData).toBe(true);
    expect(tracker.ratio).toBeCloseTo(4.0);
  });

  it('refines ratio with multiple recordings', () => {
    const tracker = new TokenRatioTracker();
    tracker.record(4000, 1000); // 4 chars/token
    tracker.record(2000, 1000); // 2 chars/token
    // combined: 6000/2000 = 3 chars/token
    expect(tracker.ratio).toBeCloseTo(3.0);
    // safeMax = 8192 * 3 * 0.9 = 22118.4 → 22118
    expect(tracker.safeMaxChars(8192)).toBe(22118);
  });

  it('applies custom margin', () => {
    const tracker = new TokenRatioTracker();
    tracker.record(4000, 1000);
    // margin 0.8: 8192 * 4 * 0.8 = 26214.4 → 26214
    expect(tracker.safeMaxChars(8192, 0.8)).toBe(26214);
  });
});

describe('processFile embed retry', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('retries with smaller chunks when embed fails', async () => {
    const mockEmbed = vi.mocked(embed);

    // First call fails, subsequent calls succeed
    mockEmbed
      .mockRejectedValueOnce(new Error('Too many input tokens'))
      .mockResolvedValue({ embedding: [0.1, 0.2] } as never);

    const result = await processFile(
      {
        content: Buffer.from('Some content that triggers retry.'),
        filename: 'test.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'test.txt',
      },
      vectorStore as never,
    );

    expect(result.chunkCount).toBeGreaterThanOrEqual(1);
    // embed was called more than once due to retry splitting
    expect(mockEmbed.mock.calls.length).toBeGreaterThan(1);
  });
});
