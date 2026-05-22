import { describe, expect, it } from 'vitest';

import { extractScoringData, formatResponseForScoring } from './extract-scoring-data';

/** Helper: build a v6 text message content. */
function textContent(text: string) {
  return { parts: [{ type: 'text', text }] };
}

/** Helper: build an assistant message with tool output containing chunks. */
function assistantWithChunks(text: string, chunks: Record<string, unknown>[]) {
  return {
    parts: [
      { type: 'text', text },
      {
        type: 'tool-invocation',
        state: 'output-available',
        output: { _chunkSources: chunks },
      },
    ],
  };
}

describe('extractScoringData', () => {
  it('extracts response text, user question, and chunks from v6 format', () => {
    const assistant = assistantWithChunks('The answer is 42.', [
      {
        chunkId: 'c-1',
        displayIndex: 0,
        score: 0.95,
        text: 'chunk text',
        documentId: 'd-1',
        title: 'Doc',
        source: 's3://bucket/key',
      },
      { chunkId: 'c-2', displayIndex: 1, score: 0.8 },
    ]);
    const user = textContent('What is the answer?');

    const result = extractScoringData(assistant, user);

    expect(result).not.toBeNull();
    expect(result?.responseText).toBe('The answer is 42.');
    expect(result?.userQuestion).toBe('What is the answer?');
    expect(result?.chunkSources).toHaveLength(2);
    expect(result?.chunkSources[0]).toEqual({
      chunkId: 'c-1',
      displayIndex: '0',
      score: 0.95,
      text: 'chunk text',
      documentId: 'd-1',
      title: 'Doc',
      section: undefined,
      source: 's3://bucket/key',
      syncTargetName: undefined,
    });
    expect(result?.chunkSources[1]).toEqual({
      chunkId: 'c-2',
      displayIndex: '1',
      score: 0.8,
      text: undefined,
      documentId: undefined,
      title: undefined,
      section: undefined,
      source: undefined,
      syncTargetName: undefined,
    });
  });

  it('returns ScoringData with empty chunkSources when no chunks present (direct answer)', () => {
    const assistant = textContent('I can help with that.');
    const user = textContent('Help me');

    const result = extractScoringData(assistant, user);

    expect(result).not.toBeNull();
    expect(result?.responseText).toBe('I can help with that.');
    expect(result?.userQuestion).toBe('Help me');
    expect(result?.chunkSources).toEqual([]);
  });

  it('returns null when assistant has no text content', () => {
    const assistant = { parts: [{ type: 'tool-invocation', state: 'output-available', output: {} }] };
    const user = textContent('Hello');
    expect(extractScoringData(assistant, user)).toBeNull();
  });

  it('returns null when user content has no text', () => {
    const assistant = textContent('Answer');
    const user = { parts: [] };
    expect(extractScoringData(assistant, user)).toBeNull();
  });

  it('returns null when assistantContent is null/undefined', () => {
    expect(extractScoringData(null, textContent('Hello'))).toBeNull();
    expect(extractScoringData(undefined, textContent('Hello'))).toBeNull();
  });

  it('returns null when userContent is null/undefined', () => {
    expect(extractScoringData(textContent('Answer'), null)).toBeNull();
    expect(extractScoringData(textContent('Answer'), undefined)).toBeNull();
  });

  it('handles legacy content format (flat content string)', () => {
    const assistant = { content: 'Legacy response' };
    const user = { content: 'Legacy question' };

    const result = extractScoringData(assistant, user);

    expect(result).not.toBeNull();
    expect(result?.responseText).toBe('Legacy response');
    expect(result?.userQuestion).toBe('Legacy question');
    expect(result?.chunkSources).toEqual([]);
  });

  it('extracts chunks from Mastra v6 toolInvocation format', () => {
    const assistant = {
      parts: [
        { type: 'text', text: 'Answer with citations.' },
        {
          type: 'tool-invocation',
          toolInvocation: {
            state: 'result',
            result: { _chunkSources: [{ chunkId: 'c-v6', displayIndex: 0, score: 0.9, documentId: 'd-v6' }] },
          },
        },
      ],
    };
    const user = textContent('Question about pricing');

    const result = extractScoringData(assistant, user);

    expect(result).not.toBeNull();
    expect(result?.chunkSources).toHaveLength(1);
    expect(result?.chunkSources[0].chunkId).toBe('c-v6');
    expect(result?.chunkSources[0].documentId).toBe('d-v6');
  });

  it('aggregates chunks from multiple tool-invocation parts', () => {
    const assistant = {
      parts: [
        { type: 'text', text: 'The combined answer.' },
        {
          type: 'tool-invocation',
          state: 'output-available',
          output: { _chunkSources: [{ chunkId: 'c-1', displayIndex: 0 }] },
        },
        {
          type: 'tool-result',
          state: 'output-available',
          output: { _chunkSources: [{ chunkId: 'c-2', displayIndex: 1 }] },
        },
      ],
    };
    const user = textContent('Question');

    const result = extractScoringData(assistant, user);

    expect(result).not.toBeNull();
    expect(result?.chunkSources).toHaveLength(2);
    expect(result?.chunkSources[0].chunkId).toBe('c-1');
    expect(result?.chunkSources[1].chunkId).toBe('c-2');
  });

  it('ignores tool parts that are not in output-available state', () => {
    const assistant = {
      parts: [
        { type: 'text', text: 'Answer' },
        {
          type: 'tool-invocation',
          state: 'call',
          output: { _chunkSources: [{ chunkId: 'should-be-ignored' }] },
        },
      ],
    };
    const user = textContent('Question');

    const result = extractScoringData(assistant, user);

    expect(result).not.toBeNull();
    expect(result?.chunkSources).toEqual([]);
  });

  it('skips chunk entries without a chunkId', () => {
    const assistant = assistantWithChunks('Answer', [
      { displayIndex: 0, score: 0.5 }, // no chunkId
      { chunkId: 'c-1', displayIndex: 1 },
    ]);
    const user = textContent('Question');

    const result = extractScoringData(assistant, user);

    expect(result?.chunkSources).toHaveLength(1);
    expect(result?.chunkSources[0].chunkId).toBe('c-1');
  });

  it('handles malformed content objects without throwing', () => {
    expect(extractScoringData({}, {})).toBeNull();
    expect(extractScoringData({ parts: 'not-array' }, textContent('Q'))).toBeNull();
    expect(extractScoringData(42, textContent('Q'))).toBeNull();
  });

  it('joins multiple text parts with newline', () => {
    const assistant = {
      parts: [
        { type: 'text', text: 'First paragraph.' },
        { type: 'text', text: 'Second paragraph.' },
      ],
    };
    const user = textContent('Question');

    const result = extractScoringData(assistant, user);

    expect(result?.responseText).toBe('First paragraph.\nSecond paragraph.');
  });
});

describe('formatResponseForScoring', () => {
  const sources = [
    {
      chunkId: 'c-1',
      displayIndex: '1.1',
      title: 'Privacy Policy EU',
      source: 'support/privacy-policy-eu.txt',
      syncTargetName: 'Support Docs',
    },
    {
      chunkId: 'c-2',
      displayIndex: '1.2',
      title: 'Privacy Policy EU',
      source: 'support/privacy-policy-eu.txt',
      syncTargetName: 'Support Docs',
    },
    {
      chunkId: 'c-3',
      displayIndex: '2',
      title: 'Privacy Policy',
      source: 'support/privacy-policy.txt',
      syncTargetName: 'Support Docs',
    },
  ];

  it('collapses [Source: N.M] to [N]', () => {
    const text = 'Cookies are used [Source: 1.1].';
    const result = formatResponseForScoring(text, sources);
    expect(result).toContain('Cookies are used [1].');
  });

  it('collapses multi-ref [Source: 1.1, 1.2] to [1]', () => {
    const text = 'See policy [Source: 1.1, 1.2].';
    const result = formatResponseForScoring(text, sources);
    expect(result).toContain('See policy [1].');
  });

  it('preserves distinct document refs [Source: 1.1, 2]', () => {
    const text = 'Both policies apply [Source: 1.1, 2].';
    const result = formatResponseForScoring(text, sources);
    expect(result).toContain('Both policies apply [1, 2].');
  });

  it('does not append a footer (footer would confuse scorers)', () => {
    const text = 'Answer [Source: 2].';
    const result = formatResponseForScoring(text, sources);
    expect(result).not.toContain('Sources:');
    expect(result).toBe('Answer [2].');
  });

  it('returns text unchanged when no chunk sources', () => {
    const text = 'No citations here.';
    expect(formatResponseForScoring(text, [])).toBe(text);
  });

  it('returns text unchanged when no [Source:] patterns', () => {
    const text = 'Hello! How can I help?';
    const result = formatResponseForScoring(text, sources);
    expect(result).toBe(text);
  });

  it('handles multiple document refs without adding footer', () => {
    const text = 'A [Source: 2]. B [Source: 1.1].';
    const result = formatResponseForScoring(text, sources);
    expect(result).toBe('A [2]. B [1].');
  });
});
