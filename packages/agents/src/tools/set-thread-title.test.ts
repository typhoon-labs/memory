import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables
// ---------------------------------------------------------------------------

const { mockGenerateText } = vi.hoisted(() => {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- mock needs flexible args
  const mockGenerateText = vi.fn(async (..._args: any[]) => ({ output: { title: 'Generated Title' } }) as any);
  return { mockGenerateText };
});

const { mockTitleModel, mockCreateTitleModel } = vi.hoisted(() => {
  const mockTitleModel = { id: 'title-model' };
  const mockCreateTitleModel = vi.fn(() => mockTitleModel);
  return { mockTitleModel, mockCreateTitleModel };
});

const { mockEmitToolProgress, mockEmitThreadTitle } = vi.hoisted(() => {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- mock needs flexible args
  const mockEmitToolProgress = vi.fn(async (..._args: any[]) => undefined);
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- mock needs flexible args
  const mockEmitThreadTitle = vi.fn(async (..._args: any[]) => undefined);
  return { mockEmitToolProgress, mockEmitThreadTitle };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('ai', () => ({ generateText: mockGenerateText, Output: { object: vi.fn(() => ({})) } }));
vi.mock('@typhoon/ai', () => ({ createTitleModel: mockCreateTitleModel }));
vi.mock('./with-progress', () => ({ emitToolProgress: mockEmitToolProgress, emitThreadTitle: mockEmitThreadTitle }));

// Import after mocks
import { setThreadTitle } from './set-thread-title';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemoryStore(thread?: { title?: string; metadata?: Record<string, unknown> } | null) {
  return {
    getThreadById: vi.fn(async () => thread ?? null),
    updateThread: vi.fn(async () => undefined),
  };
}

function makeStorage(memoryStore?: ReturnType<typeof makeMemoryStore> | null) {
  return {
    getStore: vi.fn(async () => memoryStore ?? null),
  };
}

function makeMastra(storage?: ReturnType<typeof makeStorage> | null) {
  return {
    getStorage: vi.fn(() => storage ?? null),
  };
}

function makeContext(threadId?: string, mastra?: ReturnType<typeof makeMastra> | null) {
  return {
    agent: threadId ? { threadId } : undefined,
    mastra: mastra ?? undefined,
  };
}

// The tool's execute function signature from createTool: (input, context) => Promise<output>
async function callExecute(userMessage: string, context: any) {
  // setThreadTitle is a Mastra tool created with createTool; access execute directly
  return setThreadTitle.execute?.({ userMessage }, context);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setThreadTitle tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ output: { title: 'Generated Title' } });
    mockCreateTitleModel.mockReturnValue(mockTitleModel);
    mockEmitToolProgress.mockResolvedValue(undefined);
    mockEmitThreadTitle.mockResolvedValue(undefined);
  });

  it('returns empty title when context has no threadId', async () => {
    const context = makeContext(undefined, makeMastra(makeStorage(makeMemoryStore())));
    const result = await callExecute('Hello', context);
    expect(result).toEqual({ title: '' });
  });

  it('returns empty title when mastra is not in context', async () => {
    const context = makeContext('thread-1', null);
    const result = await callExecute('Hello', context);
    expect(result).toEqual({ title: '' });
  });

  it('returns empty title when storage is unavailable', async () => {
    const mastra = makeMastra(null);
    const context = makeContext('thread-1', mastra);
    const result = await callExecute('Hello', context);
    expect(result).toEqual({ title: '' });
  });

  it('returns empty title when memory store is unavailable', async () => {
    const storage = makeStorage(null);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);
    const result = await callExecute('Hello', context);
    expect(result).toEqual({ title: '' });
  });

  it('skips generation and returns existing title when thread already has a title', async () => {
    const memoryStore = makeMemoryStore({ title: 'Existing Title', metadata: {} });
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    const result = await callExecute('Hello', context);

    expect(result).toEqual({ title: 'Existing Title' });
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(memoryStore.updateThread).not.toHaveBeenCalled();
  });

  it('calls LLM to generate a title when thread has no existing title', async () => {
    const memoryStore = makeMemoryStore({ title: undefined });
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    const result = await callExecute('How do I reset my password?', context);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(result).toEqual({ title: 'Generated Title' });
  });

  it('updates the thread in storage with the generated title', async () => {
    const memoryStore = makeMemoryStore({ title: undefined, metadata: { key: 'value' } });
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-42', mastra);

    mockGenerateText.mockResolvedValue({ output: { title: 'Refund Policy Inquiry' } });

    await callExecute('What is the refund policy?', context);

    expect(memoryStore.updateThread).toHaveBeenCalledWith({
      id: 'thread-42',
      title: 'Refund Policy Inquiry',
      metadata: { key: 'value' },
    });
  });

  it('truncates title to 80 chars', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    mockGenerateText.mockResolvedValue({ output: { title: 'A'.repeat(100) } });

    const result = (await callExecute('Hello', context)) as { title: string };
    expect(result?.title.length).toBe(80);
  });

  it('truncates userMessage to 200 chars when building the LLM prompt', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    const longMessage = 'A'.repeat(300);
    await callExecute(longMessage, context);

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { prompt?: string } | undefined;
    expect(callArgs?.prompt).toContain('A'.repeat(200));
    expect(callArgs?.prompt).not.toContain('A'.repeat(201));
  });

  it('calls emitToolProgress before and after LLM generation', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    await callExecute('Hello', context);

    expect(mockEmitToolProgress).toHaveBeenCalledTimes(2);
    // First call: naming in-progress
    expect(mockEmitToolProgress.mock.calls[0]?.[1]).toBe('Naming conversation…');
    // Second call: done with the title
    expect(mockEmitToolProgress.mock.calls[1]?.[2]).toBe('done');
  });

  it('returns empty title when LLM returns null output', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    mockGenerateText.mockResolvedValue({ output: null });

    const result = await callExecute('Hello', context);
    expect(result).toEqual({ title: '' });
    // Should not update thread when title is empty
    expect(memoryStore.updateThread).not.toHaveBeenCalled();
  });

  it('uses the "memory" store name to get the memory store', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    await callExecute('Hello', context);

    expect(storage.getStore).toHaveBeenCalledWith('memory');
  });

  it('generates title with temperature 0', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    await callExecute('Hello', context);

    const callArgs = mockGenerateText.mock.calls[0]?.[0] as { temperature?: number } | undefined;
    expect(callArgs?.temperature).toBe(0);
  });

  it('emits a data-thread-title stream part after updating the thread', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    mockGenerateText.mockResolvedValue({ output: { title: 'Streamed Title' } });

    await callExecute('Hello', context);

    expect(mockEmitThreadTitle).toHaveBeenCalledWith(expect.anything(), 'Streamed Title');
  });

  it('does not emit data-thread-title when title is empty', async () => {
    const memoryStore = makeMemoryStore(null);
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-1', mastra);

    mockGenerateText.mockResolvedValue({ output: null });

    await callExecute('Hello', context);

    expect(mockEmitThreadTitle).not.toHaveBeenCalled();
  });

  it('passes thread metadata from the fetched thread to updateThread', async () => {
    const threadMetadata = { source: 'widget', orgId: 'org-99' };
    const memoryStore = makeMemoryStore({ title: undefined, metadata: threadMetadata });
    const storage = makeStorage(memoryStore);
    const mastra = makeMastra(storage);
    const context = makeContext('thread-5', mastra);

    await callExecute('A question', context);

    expect(memoryStore.updateThread).toHaveBeenCalledWith(expect.objectContaining({ metadata: threadMetadata }));
  });
});
