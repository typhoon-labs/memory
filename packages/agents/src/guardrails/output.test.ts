import { describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/processors', () => {
  class MockBatchPartsProcessor {
    id = 'batch-parts';
    name = 'BatchPartsProcessor';
  }
  class MockPIIDetector {
    id = 'processor:pii-detector';
    name = 'PIIDetector';
  }
  class MockSystemPromptScrubber {
    id = 'system-prompt-scrubber';
    name = 'SystemPromptScrubber';
  }
  return {
    BatchPartsProcessor: MockBatchPartsProcessor,
    PIIDetector: MockPIIDetector,
    SystemPromptScrubber: MockSystemPromptScrubber,
    ProcessorStepSchema: {},
  };
});

const { mockCreateWorkflow } = vi.hoisted(() => {
  const mockCreateWorkflow = vi.fn(() => {
    // biome-ignore lint/suspicious/noThenProperty: mocking Mastra workflow API
    const wf = { then: vi.fn(() => wf), parallel: vi.fn(() => wf), map: vi.fn(() => wf), commit: vi.fn(() => wf) };
    return wf;
  });
  return { mockCreateWorkflow };
});

vi.mock('@mastra/core/workflows', () => ({
  createStep: vi.fn((p) => p),
  createWorkflow: mockCreateWorkflow,
}));

import { createFixedBatchPartsProcessor, createOutputGuardrails, type OutputGuardrailsConfig } from './output';

// ---------------------------------------------------------------------------
// createOutputGuardrails — workflow composition
// ---------------------------------------------------------------------------

describe('createOutputGuardrails', () => {
  const fakeModel = {} as never;

  it('returns workflow when defaults are used (both enabled)', () => {
    const result = createOutputGuardrails(fakeModel);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when all processors disabled', () => {
    const config: OutputGuardrailsConfig = { piiDetection: false, systemPromptScrubbing: false };
    const result = createOutputGuardrails(fakeModel, config);
    expect(result).toEqual([]);
  });

  it('creates workflow with single processor when only pii enabled', () => {
    const result = createOutputGuardrails(fakeModel, { piiDetection: true, systemPromptScrubbing: false });
    expect(result).toHaveLength(1);
  });

  it('creates workflow with single processor when only scrubbing enabled', () => {
    const result = createOutputGuardrails(fakeModel, { piiDetection: false, systemPromptScrubbing: true });
    expect(result).toHaveLength(1);
  });

  it('creates workflow with id output-guardrails', () => {
    mockCreateWorkflow.mockClear();
    createOutputGuardrails(fakeModel, { piiDetection: true, systemPromptScrubbing: false });
    expect(mockCreateWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: 'output-guardrails' }));
  });
});

// ---------------------------------------------------------------------------
// createFixedBatchPartsProcessor — test real code, not a re-implementation
// ---------------------------------------------------------------------------

describe('createFixedBatchPartsProcessor', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test fixtures bypass strict ChunkType union
  function textDelta(text: string, id = 'text-1'): any {
    return { type: 'text-delta', payload: { text, id }, runId: '1', from: 'AGENT' };
  }
  // biome-ignore lint/suspicious/noExplicitAny: test fixtures bypass strict ChunkType union
  function textStart(id: string): any {
    return { type: 'text-start', payload: { id }, runId: '1', from: 'AGENT' };
  }
  // biome-ignore lint/suspicious/noExplicitAny: test fixtures bypass strict ChunkType union
  function toolPart(type: string): any {
    return { type, payload: {}, runId: '1', from: 'AGENT' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: test helper simplifies processOutputStream call
  function call(proc: any, part: any, state: Record<string, any>) {
    return proc.processOutputStream({
      part,
      state,
      streamParts: [],
      abort: () => {
        throw new Error('aborted');
      },
    });
  }

  it('buffers text-deltas until batchSize then flushes combined', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 3 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    expect(await call(proc, textDelta('a'), state)).toBeNull();
    expect(await call(proc, textDelta('b'), state)).toBeNull();

    const result = await call(proc, textDelta('c'), state);
    expect(result).not.toBeNull();
    expect(result?.payload.text).toBe('abc');
  });

  it('flushes single text-delta with activeTextId from text-start', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 1 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    await call(proc, textStart('ts-42'), state);
    const result = await call(proc, textDelta('hello'), state);
    expect(result?.payload.id).toBe('ts-42');
    expect(result?.payload.text).toBe('hello');
  });

  it('passes non-text parts through when no pending text', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 3 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    const tool = toolPart('tool-input-start');
    const result = await call(proc, tool, state);
    expect(result).toBe(tool);
  });

  it('flushes text and defers non-text part on collision', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 10 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    await call(proc, textDelta('hello '), state);
    await call(proc, textDelta('world'), state);

    const tool = toolPart('tool-input-start');
    const flushed = await call(proc, tool, state);
    expect(flushed?.type).toBe('text-delta');
    expect(flushed?.payload.text).toBe('hello world');

    // Deferred tool part emitted on next call
    const nextResult = await call(proc, textDelta('more'), state);
    expect(nextResult).toBe(tool);
  });

  it('re-defers when another non-text arrives while pending', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 10 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    await call(proc, textDelta('x'), state);
    const tool1 = toolPart('tool-1');
    await call(proc, tool1, state);

    const tool2 = toolPart('tool-2');
    const result = await call(proc, tool2, state);
    expect(result?.type).toBe('tool-1');
    expect(state._pendingPart).toBe(tool2);
  });

  it('uses activeTextId in combined flush', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 3 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    await call(proc, textStart('ts-99'), state);
    await call(proc, textDelta('a'), state);
    await call(proc, textDelta('b'), state);
    const result = await call(proc, textDelta('c'), state);
    expect(result?.payload.id).toBe('ts-99');
  });

  it('falls back to text-1 when no activeTextId', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 2 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    await call(proc, textDelta('a'), state);
    const result = await call(proc, textDelta('b'), state);
    expect(result?.payload.id).toBe('text-1');
  });

  it('emits deferred part then batches incoming text-delta', async () => {
    const proc = createFixedBatchPartsProcessor({ batchSize: 10 });
    // biome-ignore lint/suspicious/noExplicitAny: processor state is untyped
    const state: Record<string, any> = {};

    await call(proc, textDelta('x'), state);
    const tool = toolPart('tool-start');
    await call(proc, tool, state); // flush text, defer tool

    // text-delta arrives while tool is pending → emit tool, batch text
    const result = await call(proc, textDelta('y'), state);
    expect(result).toBe(tool);
    expect(state._batch).toHaveLength(1);
  });

  describe('flush', () => {
    it('returns null for undefined state', () => {
      const proc = createFixedBatchPartsProcessor({ batchSize: 3 });
      expect(proc.flush(undefined)).toBeNull();
    });

    it('returns null for empty state', () => {
      const proc = createFixedBatchPartsProcessor({ batchSize: 3 });
      expect(proc.flush({ _batch: [] })).toBeNull();
    });

    it('returns and clears pending part', () => {
      const proc = createFixedBatchPartsProcessor({ batchSize: 3 });
      const pending = toolPart('tool-x');
      const state = { _pendingPart: pending, _batch: [] };
      expect(proc.flush(state)).toBe(pending);
      expect(state._pendingPart).toBeUndefined();
    });

    it('flushes remaining text batch', () => {
      const proc = createFixedBatchPartsProcessor({ batchSize: 10 });
      const result = proc.flush({ _batch: [textDelta('leftover')] });
      expect(result?.payload.text).toBe('leftover');
    });
  });
});
