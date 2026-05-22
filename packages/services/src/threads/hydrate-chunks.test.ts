import { describe, expect, it, vi } from 'vitest';

import { hydrateChunkSources } from './hydrate-chunks';

function makeMockVectorStore(chunks: { id: string; metadata: Record<string, unknown> }[]) {
  return {
    getChunksByIds: vi.fn().mockResolvedValue(chunks),
    getSyncTargetNames: vi.fn().mockResolvedValue(new Map()),
  };
}

function makeMessage(parts: unknown[]): { parts: unknown[] } {
  return { parts };
}

function makeToolPart(output: unknown): unknown {
  return { type: 'tool-searchKnowledge', state: 'output-available', output };
}

describe('hydrateChunkSources', () => {
  it('does nothing when no messages have tool parts', async () => {
    const store = makeMockVectorStore([]);
    const messages = [makeMessage([{ type: 'text', text: 'hello' }])];
    await hydrateChunkSources(messages, store as any);
    expect(store.getChunksByIds).not.toHaveBeenCalled();
  });

  it('does nothing when _chunkSources is absent', async () => {
    const store = makeMockVectorStore([]);
    const messages = [makeMessage([makeToolPart({ text: 'answer' })])];
    await hydrateChunkSources(messages, store as any);
    expect(store.getChunksByIds).not.toHaveBeenCalled();
  });

  it('enriches slim _chunkSources with vector store metadata', async () => {
    const store = makeMockVectorStore([
      {
        id: 'chunk-1',
        metadata: {
          title: 'Handbook',
          section: 'PTO',
          text: 'PTO is 20 days per year for all full-time employees. Part-time employees receive prorated PTO based on hours worked.',
          source: 's3/handbook.pdf',
          documentId: 'doc-1',
          startIndex: 100,
        },
      },
    ]);

    const messages = [
      makeMessage([
        makeToolPart({
          text: 'The answer.',
          _chunkSources: [{ chunkId: 'chunk-1', displayIndex: '1.1', score: 0.95 }],
        }),
      ]),
    ];

    await hydrateChunkSources(messages, store as any);

    const output = (messages[0].parts[0] as Record<string, unknown>).output as Record<string, unknown>;
    const sources = output._chunkSources as Record<string, unknown>[];

    expect(sources[0]).toMatchObject({
      chunkId: 'chunk-1',
      displayIndex: '1.1',
      score: 0.95,
      title: 'Handbook',
      section: 'PTO',
      source: 's3/handbook.pdf',
      documentId: 'doc-1',
      startIndex: 100,
    });
    // text should be sliced to 200 chars
    expect(typeof sources[0].text).toBe('string');
    expect((sources[0].text as string).length).toBeLessThanOrEqual(200);
  });

  it('preserves slim references when chunk ID is not found', async () => {
    const store = makeMockVectorStore([]);
    const slim = { chunkId: 'deleted-chunk', displayIndex: '1', score: 0.8 };
    const messages = [makeMessage([makeToolPart({ text: 'answer', _chunkSources: [slim] })])];

    await hydrateChunkSources(messages, store as any);

    const output = (messages[0].parts[0] as Record<string, unknown>).output as Record<string, unknown>;
    const sources = output._chunkSources as Record<string, unknown>[];
    expect(sources[0]).toEqual(slim);
  });

  it('deduplicates chunk IDs across multiple messages', async () => {
    const store = makeMockVectorStore([
      { id: 'chunk-1', metadata: { title: 'Doc', text: 'text', documentId: 'doc-1' } },
    ]);

    const messages = [
      makeMessage([
        makeToolPart({ text: 'a1', _chunkSources: [{ chunkId: 'chunk-1', displayIndex: '1', score: 0.9 }] }),
      ]),
      makeMessage([
        makeToolPart({ text: 'a2', _chunkSources: [{ chunkId: 'chunk-1', displayIndex: '1', score: 0.8 }] }),
      ]),
    ];

    await hydrateChunkSources(messages, store as any);

    // Only one batch call with deduplicated IDs
    expect(store.getChunksByIds).toHaveBeenCalledTimes(1);
    expect(store.getChunksByIds).toHaveBeenCalledWith('knowledge_base', ['chunk-1']);
  });

  it('skips parts that are not output-available', async () => {
    const store = makeMockVectorStore([]);
    const messages = [
      makeMessage([
        { type: 'tool-searchKnowledge', state: 'input-available', output: { _chunkSources: [{ chunkId: 'c1' }] } },
      ]),
    ];

    await hydrateChunkSources(messages, store as any);
    expect(store.getChunksByIds).not.toHaveBeenCalled();
  });
});
