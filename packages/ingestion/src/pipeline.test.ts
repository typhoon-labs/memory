import { describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ai', () => ({
  createEmbeddingModel: vi.fn(),
  createMetadataExtractionModel: vi.fn(),
  EMBEDDING_MAX_CHARS: 2_000,
  EMBEDDING_MAX_TOKENS: 8_192,
  METADATA_EXTRACTION_MAX_CHARS: 2_000,
}));
vi.mock('ai', () => ({
  embed: vi.fn(async () => ({ embedding: [0.1, 0.2] })),
  generateText: vi.fn(async () => ({
    text: 'Title\nDescription',
    output: { title: 'Title', description: 'Description' },
  })),
  Output: { object: vi.fn(() => ({})) },
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
  buildSearchMetaFields,
  deleteDocumentVectors,
  EMBEDDING_MAX_CHARS,
  enforceChunkSizeLimit,
  generateDocumentMetadata,
  makeChunkId,
  processFile,
  refreshDocumentSearchMeta,
  TokenRatioTracker,
  updateDocumentVectorMetadata,
  updateDocumentVectorSource,
  updateDocumentVectorTitle,
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
    const unsafeFn = vi.fn(async (..._args: unknown[]) => {});
    const sqlInstance = { unsafe: unsafeFn };
    await updateDocumentVectorSource(sqlInstance as never, 'doc-123', 'new-source-key');
    expect(unsafeFn).toHaveBeenCalledTimes(1);
    const [sql, params] = unsafeFn.mock.calls[0]!;
    expect(sql).toContain('UPDATE "knowledge_base"');
    expect(sql).toContain('jsonb_set');
    expect(params).toEqual(['doc-123', 'new-source-key']);
  });
});

describe('updateDocumentVectorMetadata', () => {
  it('calls sqlInstance.unsafe with correct SQL and params (merges via ||)', async () => {
    const unsafeFn = vi.fn(async (..._args: unknown[]) => {});
    const sqlInstance = { unsafe: unsafeFn };
    const meta = { department: 'sales', priority: 'high' };
    await updateDocumentVectorMetadata(sqlInstance as never, 'doc-123', meta);
    expect(unsafeFn).toHaveBeenCalledTimes(1);
    const [sql, params] = unsafeFn.mock.calls[0]!;
    expect(sql).toContain('UPDATE "knowledge_base"');
    expect(sql).toContain('||');
    expect(params).toEqual(['doc-123', JSON.stringify(meta)]);
  });
});

describe('updateDocumentVectorTitle', () => {
  it('calls sqlInstance.unsafe with correct SQL and params (jsonb_set for title)', async () => {
    const unsafeFn = vi.fn(async (..._args: unknown[]) => {});
    const sqlInstance = { unsafe: unsafeFn };
    await updateDocumentVectorTitle(sqlInstance as never, 'doc-123', 'New Title');
    expect(unsafeFn).toHaveBeenCalledTimes(1);
    const [sql, params] = unsafeFn.mock.calls[0]!;
    expect(sql).toContain('UPDATE "knowledge_base"');
    expect(sql).toContain('jsonb_set');
    expect(sql).toContain('{title}');
    expect(params).toEqual(['doc-123', 'New Title']);
  });
});

describe('refreshDocumentSearchMeta', () => {
  it('calls sqlInstance.unsafe with correct strip + merge query', async () => {
    const unsafeFn = vi.fn(async (..._args: unknown[]) => {});
    const sqlInstance = { unsafe: unsafeFn };
    const fields = { _searchMeta_A: 'US', _searchMeta_B: 'HR' };
    await refreshDocumentSearchMeta(sqlInstance as never, 'doc-123', fields);
    expect(unsafeFn).toHaveBeenCalledTimes(1);
    const [sql] = unsafeFn.mock.calls[0]!;
    expect(sql).toContain('UPDATE "knowledge_base"');
    // Should strip all four _searchMeta_ keys
    expect(sql).toContain("'_searchMeta_A'");
    expect(sql).toContain("'_searchMeta_B'");
    expect(sql).toContain("'_searchMeta_C'");
    expect(sql).toContain("'_searchMeta_D'");
    // Should merge new fields via ||
    expect(sql).toContain('||');
    expect(sql).toContain("metadata->>'documentId'");
  });

  it('passes documentId and serialized searchMetaFields as params', async () => {
    const unsafeFn = vi.fn(async (..._args: unknown[]) => {});
    const sqlInstance = { unsafe: unsafeFn };
    const fields = { _searchMeta_C: 'policy docs' };
    await refreshDocumentSearchMeta(sqlInstance as never, 'doc-456', fields);
    const [, params] = unsafeFn.mock.calls[0]!;
    expect(params).toEqual(['doc-456', JSON.stringify(fields)]);
  });
});

describe('generateDocumentMetadata', () => {
  it('extracts title and description from output object', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'My Document Title', description: 'This is a description of the document.' },
    } as never);
    const result = await generateDocumentMetadata('Sample text content', {} as never);
    expect(result.title).toBe('My Document Title');
    expect(result.description).toBe('This is a description of the document.');
    expect(result.customMetadata).toEqual({});
  });

  it('returns Untitled for null output', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: null } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.title).toBe('Untitled');
    expect(result.description).toBe('');
    expect(result.customMetadata).toEqual({});
  });

  it('strips markdown heading prefix from title', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: '## My Title', description: 'Description here' },
    } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.title).toBe('My Title');
  });

  it('returns customMetadata when metadataSchema is provided', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc', country: 'us', department: 'sales' },
    } as never);
    const schema = {
      country: { type: 'string' as const, allowedValues: ['us', 'de'], description: 'Country' },
      department: { type: 'string' as const, allowedValues: ['sales', 'engineering'], description: 'Dept' },
    };
    const result = await generateDocumentMetadata('text', {} as never, schema);
    expect(result.title).toBe('Title');
    expect(result.description).toBe('Desc');
    expect(result.customMetadata).toEqual({ country: 'us', department: 'sales' });
  });

  it('limits sample to METADATA_EXTRACTION_MAX_CHARS', async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc' },
    } as never);
    const longText = '\u2603'.repeat(5000);
    await generateDocumentMetadata(longText, {} as never);
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as { prompt: string };
    // The sample is limited to 2000 chars (METADATA_EXTRACTION_MAX_CHARS mock value).
    // The prompt includes instruction text wrapping the sample, so it is longer,
    // but should NOT contain 5000 snowman chars.
    const sampleCount = (callArgs.prompt.match(/\u2603/g) ?? []).length;
    expect(sampleCount).toBe(2000);
  });
});

describe('processFile', () => {
  const vectorStore = { upsert: vi.fn(async (..._args: unknown[]) => []) };

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
    expect(result).toEqual({ chunkCount: 0, title: null, description: null, customMetadata: {} });
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
    expect(result).toEqual({ chunkCount: 0, title: null, description: null, customMetadata: {} });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = vectorStore.upsert.mock.calls[0]![0] as Record<string, any>;
    expect(call.indexName).toBe('knowledge_base');
    // Deterministic IDs should be passed
    expect(call.ids).toBeDefined();
    expect(call.ids).toHaveLength(1);
    expect(typeof call.ids[0]).toBe('string');
    expect(call.ids[0]).toHaveLength(32); // sha256 hex truncated to 32 chars
    // Metadata should include section field
    expect(call.metadata[0]).toHaveProperty('section');
  });

  it('spreads customMetadata into chunk metadata at upsert', async () => {
    vectorStore.upsert.mockClear();
    await processFile(
      {
        content: Buffer.from('Content for custom metadata test.'),
        filename: 'meta.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'meta.txt',
        customMetadata: { department: 'engineering', priority: 'high' },
      },
      vectorStore as never,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = vectorStore.upsert.mock.calls[0]![0] as Record<string, any>;
    expect(call.metadata[0]).toHaveProperty('department', 'engineering');
    expect(call.metadata[0]).toHaveProperty('priority', 'high');
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
    expect(result.at(-1)?.text).toBe('also small');
    expect(result.length).toBe(5); // 1 + 3 splits + 1
  });

  it('splits chunks exceeding the model hard limit', () => {
    const text = 'x'.repeat(5_000);
    const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], EMBEDDING_MAX_CHARS);
    expect(result.length).toBe(3);
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

  describe('overlap', () => {
    it('includes overlap between paragraph-split chunks', () => {
      const p1 = 'a'.repeat(30);
      const p2 = 'b'.repeat(30);
      const p3 = 'c'.repeat(30);
      const text = `${p1}\n\n${p2}\n\n${p3}`;
      // maxChars=70 fits p1+p2 (62 with joiner) but not all three (96)
      const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], 70, 40);
      expect(result.length).toBe(2);
      // p2 (30 chars) fits in overlap budget of 40, so chunk 2 starts with p2
      expect(result[1]?.text).toContain(p2);
      expect(result[1]?.text).toContain(p3);
    });

    it('includes overlap between sentence-split chunks', () => {
      const s1 = `${'a'.repeat(30)}.`;
      const s2 = `${'b'.repeat(30)}.`;
      const s3 = `${'c'.repeat(30)}.`;
      const text = `${s1} ${s2} ${s3}`;
      // maxChars=70 fits s1+s2 (63 with space joiner) but not all three (95)
      const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], 70, 40);
      expect(result.length).toBe(2);
      // s2 (31 chars) fits in overlap budget of 40, so chunk 2 starts with s2
      expect(result[1]?.text).toContain(s2);
      expect(result[1]?.text).toContain(s3);
    });

    it('does not apply overlap to hard character splits', () => {
      const text = 'x'.repeat(250);
      const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], 100, 40);
      // Hard split: 100 + 100 + 50, no overlap
      expect(result).toHaveLength(3);
      expect(result[0]?.text).toHaveLength(100);
      expect(result[1]?.text).toHaveLength(100);
      expect(result[2]?.text).toHaveLength(50);
    });

    it('uses whole parts for overlap when they fit in the budget', () => {
      const p1 = 'a'.repeat(20);
      const p2 = 'b'.repeat(20);
      const p3 = 'c'.repeat(20);
      const text = `${p1}\n\n${p2}\n\n${p3}`;
      // overlap=25 fits p2 (20 chars), so chunk 2 starts with the whole paragraph
      const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], 45, 25);
      expect(result.length).toBe(2);
      expect(result[0]?.text).toBe(`${p1}\n\n${p2}`);
      expect(result[1]?.text).toBe(`${p2}\n\n${p3}`);
    });

    it('falls back to character overlap when no whole part fits', () => {
      // 3 long sentences, each >50 chars, overlap budget=50
      const s1 = `${'a'.repeat(80)}.`;
      const s2 = `${'b'.repeat(80)}.`;
      const s3 = `${'c'.repeat(80)}.`;
      const text = `${s1} ${s2} ${s3}`;
      const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], 200, 50);
      expect(result.length).toBeGreaterThan(1);
      // Chunk 2 should start with the last 50 chars of chunk 1
      const prevTail = result[0]?.text.slice(-50);
      expect(result[1]?.text.startsWith(prevTail!)).toBe(true);
    });

    it('produces no duplication when overlap is 0', () => {
      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);
      const text = `${p1}\n\n${p2}\n\n${p3}`;
      const result = enforceChunkSizeLimit([{ text, metadata: { ...meta } }], 100, 0);
      const allText = result.map((c) => c.text).join('');
      // No content should be duplicated
      expect(allText).not.toContain(p1 + p2);
      expect(result.length).toBeGreaterThan(1);
      for (const chunk of result) {
        expect(chunk.text.length).toBeLessThanOrEqual(100);
      }
    });
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

describe('generateDocumentMetadata — custom metadata edge cases', () => {
  it('filters out values not matching allowedValues', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc', region: 'invalid-region' },
    } as never);
    const schema = {
      region: { type: 'string' as const, allowedValues: ['us', 'eu'], description: 'Region' },
    };
    const result = await generateDocumentMetadata('text', {} as never, schema);
    expect(result.customMetadata).toEqual({});
  });

  it('filters out keys not in the metadataSchema', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc', unknownField: 'something' },
    } as never);
    const schema = {
      region: { type: 'string' as const, description: 'Region' },
    };
    const result = await generateDocumentMetadata('text', {} as never, schema);
    expect(result.customMetadata).toEqual({});
  });

  it('skips null/undefined values in custom metadata', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc', region: null, dept: undefined },
    } as never);
    const schema = {
      region: { type: 'string' as const, description: 'Region' },
      dept: { type: 'string' as const, description: 'Department' },
    };
    const result = await generateDocumentMetadata('text', {} as never, schema);
    expect(result.customMetadata).toEqual({});
  });

  it('validates array values against allowedValues', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc', tags: ['valid', 'invalid'] },
    } as never);
    const schema = {
      tags: { type: 'string[]' as const, allowedValues: ['valid', 'ok'], description: 'Tags' },
    };
    const result = await generateDocumentMetadata('text', {} as never, schema);
    // Array contains 'invalid' which is not in allowedValues, so the whole field is excluded
    expect(result.customMetadata).toEqual({});
  });

  it('accepts array values when all are in allowedValues', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc', tags: ['valid', 'ok'] },
    } as never);
    const schema = {
      tags: { type: 'string[]' as const, allowedValues: ['valid', 'ok', 'good'], description: 'Tags' },
    };
    const result = await generateDocumentMetadata('text', {} as never, schema);
    expect(result.customMetadata).toEqual({ tags: ['valid', 'ok'] });
  });

  it('handles empty metadataSchema (no custom fields)', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Title', description: 'Desc' },
    } as never);
    const result = await generateDocumentMetadata('text', {} as never, {});
    expect(result.customMetadata).toEqual({});
  });

  it('returns non-string title as Untitled', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 42, description: 'Some description' },
    } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.title).toBe('Untitled');
  });

  it('returns empty string for non-string description', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'My Title', description: 123 },
    } as never);
    const result = await generateDocumentMetadata('text', {} as never);
    expect(result.description).toBe('');
  });
});

describe('processFile — cancellation', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('returns early when isCancelled returns true before chunk stage', async () => {
    const isCancelled = vi.fn().mockResolvedValue(true);
    const result = await processFile(
      {
        content: Buffer.from('Some content to process.'),
        filename: 'cancel.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'cancel.txt',
        isCancelled,
      },
      vectorStore as never,
    );
    expect(result.chunkCount).toBe(0);
    expect(result.title).toBeNull();
  });
});

describe('processFile — Markdown format', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('creates MDocument.fromMarkdown for .md files', async () => {
    const { MDocument } = await import('@mastra/rag');
    vi.mocked(MDocument.fromMarkdown).mockClear();

    await processFile(
      {
        content: Buffer.from('# Hello\n\nWorld'),
        filename: 'test.md',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'test.md',
      },
      vectorStore as never,
    );

    // .md files use getMDocFormat which returns 'markdown'
    expect(MDocument.fromMarkdown).toHaveBeenCalled();
  });
});

describe('processFile — JSON format', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('creates MDocument.fromJSON for .json files', async () => {
    const { MDocument } = await import('@mastra/rag');
    vi.mocked(MDocument.fromJSON).mockClear();

    await processFile(
      {
        content: Buffer.from('{"key": "value"}'),
        filename: 'test.json',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'test.json',
      },
      vectorStore as never,
    );

    // .json files use getMDocFormat which returns 'json'
    expect(MDocument.fromJSON).toHaveBeenCalled();
  });
});

describe('processFile — customMetadata merge in return value', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('merges input customMetadata with LLM-extracted customMetadata', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'My Doc', description: 'A doc', priority: 'high' },
    } as never);

    const result = await processFile(
      {
        content: Buffer.from('Some content here.'),
        filename: 'merge.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'merge.txt',
        customMetadata: { department: 'engineering' },
        metadataSchema: { priority: { type: 'string', allowedValues: ['high', 'low'] } },
      },
      vectorStore as never,
    );

    // LLM-extracted metadata should override input defaults
    expect(result.customMetadata).toHaveProperty('department', 'engineering');
    expect(result.customMetadata).toHaveProperty('priority', 'high');
  });
});

describe('processFile — _searchMeta_* fields in upsert', () => {
  it('includes _searchMeta fields when fieldSchema is provided', async () => {
    const vectorStore = { upsert: vi.fn(async () => []) };

    await processFile(
      {
        content: Buffer.from('Some document text.'),
        filename: 'meta.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'meta.txt',
        customMetadata: { region: 'US', department: 'HR' },
        fieldSchema: {
          region: { searchable: true, searchPriority: 'critical' },
          department: { searchPriority: 'high' },
        },
      },
      vectorStore as never,
    );

    expect(vectorStore.upsert).toHaveBeenCalled();
    const upsertCall = (vectorStore.upsert.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    const chunkMeta = (upsertCall.metadata as Record<string, unknown>[])[0];
    expect(chunkMeta._searchMeta_A).toBe('US');
    expect(chunkMeta._searchMeta_B).toBe('HR');
  });

  it('omits _searchMeta fields when no fieldSchema is provided (opt-in)', async () => {
    const vectorStore = { upsert: vi.fn(async () => []) };

    await processFile(
      {
        content: Buffer.from('Some document text.'),
        filename: 'nometa.txt',
        documentId: 'doc-2',
        syncTargetId: 'st-1',
        sourceKey: 'nometa.txt',
        customMetadata: { region: 'US' },
      },
      vectorStore as never,
    );

    expect(vectorStore.upsert).toHaveBeenCalled();
    const upsertCall = (vectorStore.upsert.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    const chunkMeta = (upsertCall.metadata as Record<string, unknown>[])[0];
    expect(chunkMeta._searchMeta_A).toBeUndefined();
    expect(chunkMeta._searchMeta_B).toBeUndefined();
    expect(chunkMeta._searchMeta_C).toBeUndefined();
    expect(chunkMeta._searchMeta_D).toBeUndefined();
  });
});

describe('processFile — cancellation mid-pipeline', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('returns early when isCancelled returns true after chunk stage', async () => {
    let callCount = 0;
    const isCancelled = vi.fn(async () => {
      callCount++;
      // Allow first check (before chunk), cancel on second (before metadata)
      return callCount >= 2;
    });
    const onStage = vi.fn();
    const result = await processFile(
      {
        content: Buffer.from('Content to partially process.'),
        filename: 'partial.txt',
        documentId: 'doc-2',
        syncTargetId: 'st-1',
        sourceKey: 'partial.txt',
        isCancelled,
        onStage,
      },
      vectorStore as never,
    );
    // Pipeline should bail with zero chunks because cancellation happened
    expect(result.chunkCount).toBe(0);
    expect(result.title).toBeNull();
  });
});

describe('processFile — with custom metadata and schema', () => {
  const vectorStore = { upsert: vi.fn(async () => []) };

  it('passes metadataSchema to generateDocumentMetadata', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { title: 'Doc Title', description: 'A doc', department: 'engineering' },
    } as never);

    const schema = {
      department: { type: 'string' as const, allowedValues: ['engineering', 'sales'], description: 'Dept' },
    };
    const result = await processFile(
      {
        content: Buffer.from('Some engineering document content.'),
        filename: 'eng.txt',
        documentId: 'doc-1',
        syncTargetId: 'st-1',
        sourceKey: 'eng.txt',
        metadataSchema: schema,
      },
      vectorStore as never,
    );

    expect(result.title).toBe('Doc Title');
    expect(result.customMetadata).toHaveProperty('department', 'engineering');
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

// =============================================================================
// buildSearchMetaFields
// =============================================================================

describe('buildSearchMetaFields', () => {
  it('returns empty object for empty custom metadata', () => {
    expect(buildSearchMetaFields({})).toEqual({});
  });

  it('buckets fields by priority tier', () => {
    const result = buildSearchMetaFields(
      { region: 'US', department: 'HR', category: 'policy', score: '42' },
      {
        region: { type: 'string', searchPriority: 'critical' },
        department: { type: 'string', searchPriority: 'high' },
        category: { type: 'string', searchPriority: 'moderate' },
        score: { type: 'string', searchPriority: 'standard' },
      },
    );
    expect(result).toEqual({
      _searchMeta_A: 'US',
      _searchMeta_B: 'HR',
      _searchMeta_C: 'policy',
      _searchMeta_D: '42',
    });
  });

  it('excludes fields without searchable or searchPriority (opt-in)', () => {
    const result = buildSearchMetaFields(
      { region: 'US', internalId: '123' },
      {
        region: { type: 'string', searchable: true },
        internalId: { type: 'string' },
      },
    );
    expect(result).toEqual({ _searchMeta_C: 'US' });
  });

  it('returns empty when no schema provided (opt-in requires schema)', () => {
    const result = buildSearchMetaFields({ region: 'US', dept: 'HR' });
    expect(result).toEqual({});
  });

  it('returns empty when field has no searchable or searchPriority', () => {
    const result = buildSearchMetaFields({ region: 'US' }, { region: { type: 'string' } });
    expect(result).toEqual({});
  });

  it('includes field with searchable: true, defaults to moderate (C tier)', () => {
    const result = buildSearchMetaFields({ region: 'US' }, { region: { type: 'string', searchable: true } });
    expect(result).toEqual({ _searchMeta_C: 'US' });
  });

  it('includes field with explicit searchPriority even without searchable flag', () => {
    const result = buildSearchMetaFields({ region: 'US' }, { region: { type: 'string', searchPriority: 'high' } });
    expect(result).toEqual({ _searchMeta_B: 'US' });
  });

  it('joins array values with spaces', () => {
    const result = buildSearchMetaFields(
      { tags: ['policy', 'legal', 'hr'] },
      { tags: { type: 'string[]', searchable: true } },
    );
    expect(result).toEqual({ _searchMeta_C: 'policy legal hr' });
  });

  it('skips null, undefined, and empty string values', () => {
    const result = buildSearchMetaFields(
      { a: null, b: undefined, c: '', d: 'valid' },
      {
        a: { type: 'string', searchable: true },
        b: { type: 'string', searchable: true },
        c: { type: 'string', searchable: true },
        d: { type: 'string', searchable: true },
      },
    );
    expect(result).toEqual({ _searchMeta_C: 'valid' });
  });

  it('groups multiple fields into the same tier', () => {
    const result = buildSearchMetaFields(
      { a: 'one', b: 'two', c: 'three' },
      {
        a: { type: 'string', searchPriority: 'high' },
        b: { type: 'string', searchPriority: 'high' },
        c: { type: 'string', searchPriority: 'standard' },
      },
    );
    expect(result).toEqual({
      _searchMeta_B: 'one two',
      _searchMeta_D: 'three',
    });
  });
});
