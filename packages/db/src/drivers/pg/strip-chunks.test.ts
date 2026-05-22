import { describe, expect, it } from 'vitest';

import { stripChunkSources } from './strip-chunks';

describe('stripChunkSources', () => {
  it('returns content unchanged when format is not 2', () => {
    const content = { format: 1, parts: [] };
    expect(stripChunkSources(content)).toBe(content);
  });

  it('returns content unchanged when no parts', () => {
    const content = { format: 2 };
    expect(stripChunkSources(content as Record<string, unknown>)).toBe(content);
  });

  it('strips metadata from _chunkSources, keeping only chunkId and displayIndex', () => {
    const content = {
      format: 2,
      parts: [
        { type: 'text', text: 'hello' },
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            toolName: 'searchKnowledge',
            result: {
              text: 'The answer [Source: 1.1].',
              _chunkSources: [
                {
                  index: 1,
                  chunkId: 'abc123',
                  displayIndex: '1.1',
                  title: 'Handbook',
                  section: 'PTO',
                  text: 'PTO is 20 days.',
                  source: 's3/handbook.pdf',
                  documentId: 'doc-1',
                  startIndex: 100,
                  score: 0.95,
                  searchTool: 'searchKnowledgeBaseHybrid',
                },
              ],
            },
          },
        },
      ],
    };

    const result = stripChunkSources(content);
    const inv = (result.parts as unknown[])[1] as Record<string, unknown>;
    const toolInv = inv.toolInvocation as Record<string, unknown>;
    const toolResult = toolInv.result as Record<string, unknown>;
    const chunks = toolResult._chunkSources as Record<string, unknown>[];

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ chunkId: 'abc123', displayIndex: '1.1' });
    // text field in tool result preserved
    expect(toolResult.text).toBe('The answer [Source: 1.1].');
  });

  it('does not modify parts without _chunkSources', () => {
    const content = {
      format: 2,
      parts: [
        { type: 'text', text: 'hello' },
        {
          type: 'tool-invocation',
          toolInvocation: { state: 'result', result: { title: 'Thread Title' } },
        },
      ],
    };

    const result = stripChunkSources(content);
    expect(result).toBe(content); // same reference — no modification
  });

  it('handles multiple tool invocations with _chunkSources', () => {
    const content = {
      format: 2,
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            result: {
              text: 'Answer 1',
              _chunkSources: [
                { chunkId: 'a', displayIndex: '1', title: 'Doc A', score: 0.9 },
                { chunkId: 'b', displayIndex: '2', title: 'Doc B', score: 0.8 },
              ],
            },
          },
        },
      ],
    };

    const result = stripChunkSources(content);
    const inv = (result.parts as unknown[])[0] as Record<string, unknown>;
    const chunks = ((inv.toolInvocation as Record<string, unknown>).result as Record<string, unknown>)
      ._chunkSources as Record<string, unknown>[];

    expect(chunks).toEqual([
      { chunkId: 'a', displayIndex: '1' },
      { chunkId: 'b', displayIndex: '2' },
    ]);
  });

  it('handles empty _chunkSources array without modifying', () => {
    const content = {
      format: 2,
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: { state: 'result', result: { text: 'No results', _chunkSources: [] } },
        },
      ],
    };

    const result = stripChunkSources(content);
    expect(result).toBe(content); // empty array → no modification
  });
});
