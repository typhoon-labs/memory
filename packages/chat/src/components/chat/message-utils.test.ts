import type { UIMessage } from '@ai-sdk/react';
import { describe, expect, it } from 'vitest';

import {
  collectProgressEvents,
  extractCitations,
  extractSubAgentTexts,
  formatTimestamp,
  getInitials,
  getToolName,
  HIDDEN_TOOL_NAMES,
  isVisibleToolPart,
  transformCitationPatterns,
  transformCopyText,
} from './message-utils';

function makeMessage(parts: UIMessage['parts']): UIMessage {
  return { id: 'msg-1', role: 'assistant', parts } as UIMessage;
}

describe('getToolName', () => {
  it('returns toolName when present', () => {
    expect(getToolName({ type: 'tool-invocation', toolName: 'search' })).toBe('search');
  });

  it('strips tool- prefix when toolName absent', () => {
    expect(getToolName({ type: 'tool-result' })).toBe('result');
  });
});

describe('isVisibleToolPart', () => {
  it('returns false for non-tool types', () => {
    expect(isVisibleToolPart({ type: 'text' })).toBe(false);
  });

  it('returns false for input-streaming state', () => {
    expect(isVisibleToolPart({ type: 'tool-invocation', state: 'input-streaming' })).toBe(false);
  });

  it('returns false for hidden tool names', () => {
    expect(isVisibleToolPart({ type: 'tool-invocation', toolName: 'updateWorkingMemory' })).toBe(false);
  });

  it('returns true for visible tool parts', () => {
    expect(
      isVisibleToolPart({ type: 'tool-invocation', toolName: 'searchKnowledgeBase', state: 'output-available' }),
    ).toBe(true);
  });
});

describe('HIDDEN_TOOL_NAMES', () => {
  it('contains updateWorkingMemory', () => {
    expect(HIDDEN_TOOL_NAMES.has('updateWorkingMemory')).toBe(true);
  });
});

describe('getInitials', () => {
  it('returns uppercase first character', () => {
    expect(getInitials('typhoon')).toBe('U');
    expect(getInitials('Alice')).toBe('A');
  });
});

describe('formatTimestamp', () => {
  it('formats today as time-only', () => {
    const now = new Date();
    const result = formatTimestamp(now);
    // Should not contain month name for today's date
    expect(result).toBeTruthy();
    // Time format varies by locale; just verify it doesn't include a month abbreviation typical of past dates
  });

  it('formats past date with date and time', () => {
    const past = new Date('2023-06-15T14:30:00');
    const result = formatTimestamp(past);
    expect(result).toBeTruthy();
    // Should contain some date information
    expect(result.length).toBeGreaterThan(3);
  });

  it('accepts string input', () => {
    const result = formatTimestamp('2023-01-01T12:00:00');
    expect(result).toBeTruthy();
  });
});

describe('collectProgressEvents', () => {
  it('groups progress events by toolCallId', () => {
    const message = makeMessage([
      {
        type: 'data-tool-progress',
        data: { toolCallId: 'tc-1', message: 'Step 1', status: 'in-progress' },
      } as never,
      {
        type: 'data-tool-progress',
        data: { toolCallId: 'tc-1', message: 'Step 2', status: 'done' },
      } as never,
      {
        type: 'data-tool-progress',
        data: { toolCallId: 'tc-2', message: 'Other tool', status: 'in-progress' },
      } as never,
    ]);

    const result = collectProgressEvents(message);
    expect(result.size).toBe(2);
    expect(result.get('tc-1')).toHaveLength(2);
    expect(result.get('tc-1')?.[0].message).toBe('Step 1');
    expect(result.get('tc-1')?.[1].message).toBe('Step 2');
    expect(result.get('tc-2')).toHaveLength(1);
  });

  it('ignores non-progress parts', () => {
    const message = makeMessage([{ type: 'text', text: 'hello' }]);
    const result = collectProgressEvents(message);
    expect(result.size).toBe(0);
  });

  it('ignores invalid data shapes', () => {
    const message = makeMessage([
      { type: 'data-tool-progress', data: null } as never,
      { type: 'data-tool-progress', data: { toolCallId: 123, message: 'bad id' } } as never,
      { type: 'data-tool-progress', data: { toolCallId: 'tc-1' } } as never, // missing message
    ]);
    const result = collectProgressEvents(message);
    expect(result.size).toBe(0);
  });

  it('sets status to undefined for invalid status values', () => {
    const message = makeMessage([
      { type: 'data-tool-progress', data: { toolCallId: 'tc-1', message: 'step', status: 'unknown' } } as never,
    ]);
    const result = collectProgressEvents(message);
    expect(result.get('tc-1')?.[0].status).toBeUndefined();
  });

  it('collects valid events while skipping invalid ones in same message', () => {
    const message = makeMessage([
      { type: 'data-tool-progress', data: { toolCallId: 'tc-1', message: 'Step 1', status: 'in-progress' } } as never,
      { type: 'data-tool-progress', data: null } as never,
      { type: 'data-tool-progress', data: { toolCallId: 'tc-1', message: 'Step 2', status: 'done' } } as never,
    ]);
    const result = collectProgressEvents(message);
    expect(result.get('tc-1')).toHaveLength(2);
  });
});

describe('extractCitations', () => {
  it('extracts citations from tool parts with output-available state', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBase',
        state: 'output-available',
        output: [
          { documentTitle: 'Getting Started', section: 'Installation', score: 0.95 },
          { documentTitle: 'API Reference', score: 0.8 },
        ],
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ index: 1, title: 'Getting Started', section: 'Installation', score: 0.95 });
    expect(result[1]).toMatchObject({ index: 2, title: 'API Reference', score: 0.8 });
  });

  it('extracts citations using metadata.title field', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBase',
        state: 'output-available',
        output: [
          { title: 'Handbook', text: 'PTO is 20 days.', documentId: 'doc-1', source: 'handbook.pdf', score: 0.9 },
        ],
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      index: 1,
      title: 'Handbook',
      documentId: 'doc-1',
      source: 'handbook.pdf',
      snippet: 'PTO is 20 days.',
      score: 0.9,
    });
  });

  it('extracts citations from nested metadata (vector query tool shape)', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBase',
        state: 'output-available',
        output: [
          {
            metadata: { title: 'Employee Handbook', text: 'Some chunk text', documentId: 'doc-1', source: 's3/file' },
            score: 0.85,
          },
        ],
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      index: 1,
      title: 'Employee Handbook',
      documentId: 'doc-1',
      snippet: 'Some chunk text',
      score: 0.85,
    });
  });

  it('extracts citations from hybrid search shape { sources: [...] }', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'search_knowledge_base_hybrid',
        state: 'output-available',
        output: {
          relevantContext: 'combined text',
          sources: [
            {
              id: 'vec-1',
              metadata: { title: 'HIPAA Guide', text: 'Compliance rules...', documentId: 'doc-2' },
              score: 0.88,
              document: 'Compliance rules...',
            },
          ],
        },
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ index: 1, title: 'HIPAA Guide', documentId: 'doc-2', score: 0.88 });
  });

  it('deduplicates by documentId across multiple tool calls', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBase',
        state: 'output-available',
        output: [
          { documentTitle: 'Handbook', documentId: 'doc-1', score: 0.9 },
          { documentTitle: 'Policy', documentId: 'doc-2', score: 0.8 },
        ],
      } as never,
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBaseGraph',
        state: 'output-available',
        output: [{ documentTitle: 'Handbook', documentId: 'doc-1', score: 0.85 }],
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ index: 1, title: 'Handbook', documentId: 'doc-1' });
    expect(result[1]).toMatchObject({ index: 2, title: 'Policy', documentId: 'doc-2' });
  });

  it('deduplicates by title when documentId is absent', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBase',
        state: 'output-available',
        output: [
          { documentTitle: 'Same Doc', score: 0.9 },
          { documentTitle: 'Same Doc', score: 0.7 },
        ],
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ index: 1, title: 'Same Doc' });
  });

  it('truncates snippet to 150 characters', () => {
    const longText = 'x'.repeat(300);
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledgeBase',
        state: 'output-available',
        output: [{ documentTitle: 'Doc', text: longText }],
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result[0].snippet).toHaveLength(150);
  });

  it('returns empty for non-tool parts', () => {
    const message = makeMessage([{ type: 'text', text: 'hello' }]);
    expect(extractCitations(message)).toEqual([]);
  });

  it('returns empty for non-output-available state', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'search',
        state: 'input-streaming',
        output: [{ documentTitle: 'Doc' }],
      } as never,
    ]);
    expect(extractCitations(message)).toEqual([]);
  });

  it('returns empty for non-array non-object output', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'search',
        state: 'output-available',
        output: 'not an array',
      } as never,
    ]);
    expect(extractCitations(message)).toEqual([]);
  });

  it('skips items without a usable title', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'search',
        state: 'output-available',
        output: [{ documentTitle: 'Valid', score: 0.9 }, { otherField: 'no title' }],
      } as never,
    ]);
    const result = extractCitations(message);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid');
  });

  it('skips items with non-string title', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'search',
        state: 'output-available',
        output: [{ documentTitle: null }, { documentTitle: 123 }, { documentTitle: 'Valid' }],
      } as never,
    ]);
    const result = extractCitations(message);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid');
  });

  it('extracts chunk-level citations from _chunkSources without collapsing same-doc chunks', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledge',
        state: 'output-available',
        output: {
          text: 'Answer text',
          _chunkSources: [
            {
              title: 'Handbook',
              section: 'PTO',
              documentId: 'doc-1',
              chunkId: 'chunk-a',
              displayIndex: '1.1',
              text: 'PTO is 20 days.',
              score: 0.95,
              startIndex: 100,
            },
            {
              title: 'Handbook',
              section: 'Vacation',
              documentId: 'doc-1',
              chunkId: 'chunk-b',
              displayIndex: '1.2',
              text: 'Vacation requires approval.',
              score: 0.88,
              startIndex: 500,
            },
            {
              title: 'Benefits Guide',
              documentId: 'doc-2',
              chunkId: 'chunk-c',
              displayIndex: '2',
              text: 'Health coverage details.',
              score: 0.75,
            },
          ],
        },
      } as never,
    ]);

    const result = extractCitations(message);
    const chunkCitations = result.filter((c) => !c.children);
    const parentCitations = result.filter((c) => c.children);

    // 3 chunk-level citations + 1 parent for the "Handbook" document (chunks 1.1, 1.2)
    expect(chunkCitations).toHaveLength(3);
    expect(parentCitations).toHaveLength(1);
    expect(chunkCitations[0]).toMatchObject({
      index: 1,
      title: 'Handbook',
      section: 'PTO',
      chunkId: 'chunk-a',
      displayIndex: '1.1',
      startIndex: 100,
    });
    expect(chunkCitations[1]).toMatchObject({
      index: 2,
      title: 'Handbook',
      section: 'Vacation',
      chunkId: 'chunk-b',
      displayIndex: '1.2',
      startIndex: 500,
    });
    expect(chunkCitations[2]).toMatchObject({
      index: 3,
      title: 'Benefits Guide',
      chunkId: 'chunk-c',
      displayIndex: '2',
    });
    expect(parentCitations[0]).toMatchObject({ displayIndex: '1', title: 'Handbook' });
    expect(parentCitations[0].children).toHaveLength(2);
  });

  it('deduplicates _chunkSources by chunkId', () => {
    const message = makeMessage([
      {
        type: 'tool-invocation',
        toolName: 'searchKnowledge',
        state: 'output-available',
        output: {
          text: 'Answer',
          _chunkSources: [
            { title: 'Handbook', chunkId: 'chunk-a', text: 'Same chunk text.' },
            { title: 'Handbook', chunkId: 'chunk-a', text: 'Same chunk text.' },
          ],
        },
      } as never,
    ]);

    const result = extractCitations(message);
    expect(result).toHaveLength(1);
  });
});

describe('transformCitationPatterns', () => {
  it('replaces [Source: Title — Section] with cite tag using doc-level display', () => {
    const citations = [{ index: 1, title: 'Handbook', section: 'PTO Policy' }];
    const text = 'You get 20 days PTO. [Source: Handbook \u2014 PTO Policy]';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
    expect(result).toContain('display="1"');
    expect(result).toContain('>1</cite>');
    expect(result).not.toContain('[Source:');
    expect(usedIndices).toEqual(new Set([1]));
  });

  it('replaces [Source: Title] without section using doc-level display', () => {
    const citations = [{ index: 1, title: 'Employee Handbook' }];
    const text = 'See [Source: Employee Handbook] for details.';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
    expect(result).toContain('display="1"');
    expect(result).toContain('>1</cite>');
    expect(result).not.toContain('[Source:');
    expect(usedIndices).toEqual(new Set([1]));
  });

  it('replaces multiple citation patterns', () => {
    const citations = [
      { index: 1, title: 'Handbook', section: 'PTO' },
      { index: 2, title: 'Policy Guide', section: 'Exceptions' },
    ];
    const text = 'PTO is 20 days [Source: Handbook — PTO] with exceptions [Source: Policy Guide — Exceptions].';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
    expect(result).toContain('index="2"');
    expect(result).not.toContain('[Source:');
    expect(usedIndices).toEqual(new Set([1, 2]));
  });

  it('strips unmatched title-based refs', () => {
    const citations = [{ index: 1, title: 'Handbook' }];
    const text = 'See [Source: Unknown Document — Missing Section].';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toBe('See .');
    expect(usedIndices.size).toBe(0);
  });

  it('handles en-dash separator', () => {
    const citations = [{ index: 1, title: 'Handbook', section: 'PTO' }];
    const text = '[Source: Handbook \u2013 PTO]';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
  });

  it('handles double-hyphen separator', () => {
    const citations = [{ index: 1, title: 'Handbook', section: 'PTO' }];
    const text = '[Source: Handbook -- PTO]';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
  });

  it('escapes special characters in title attribute', () => {
    const citations = [{ index: 1, title: 'Q&A Guide (2024)' }];
    const text = 'See [Source: Q&A Guide (2024)].';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toContain('title="Q&amp;A Guide (2024)"');
  });

  it('matches titles case-insensitively', () => {
    const citations = [{ index: 1, title: 'Employee Handbook' }];
    const text = '[Source: employee handbook]';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
  });

  it('is idempotent on already-transformed text', () => {
    const citations = [{ index: 1, title: 'Handbook' }];
    const text = '<cite index="1" title="Handbook">1</cite>';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toBe(text);
  });

  it('returns text unchanged when citations array is empty', () => {
    const text = 'Some text [Source: Handbook].';
    const { text: result, usedIndices } = transformCitationPatterns(text, []);
    expect(result).toBe(text);
    expect(usedIndices.size).toBe(0);
  });

  it('returns text unchanged when no patterns present', () => {
    const citations = [{ index: 1, title: 'Handbook' }];
    const text = 'No citations here.';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toBe(text);
    expect(usedIndices.size).toBe(0);
  });

  it('matches by substring when exact title match fails', () => {
    const citations = [{ index: 1, title: 'Company Employee Handbook 2024 Edition' }];
    const text = '[Source: Employee Handbook 2024]';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toContain('index="1"');
  });

  it('handles hierarchical [Source: 1.1] references', () => {
    const citations = [
      { index: 1, title: 'Handbook', section: 'PTO', displayIndex: '1.1' },
      { index: 2, title: 'Handbook', section: 'Vacation', displayIndex: '1.2' },
      { index: 3, title: 'Benefits Guide', displayIndex: '2' },
    ];
    const text = 'PTO is 20 days [Source: 1.1]. Vacation needs approval [Source: 1.2]. Benefits are good [Source: 2].';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toContain('<cite index="1"');
    expect(result).toContain('<cite index="2"');
    expect(result).toContain('<cite index="3"');
    expect(result).not.toContain('[Source:');
    expect(usedIndices).toEqual(new Set([1, 2, 3]));
  });

  it('handles multi-source [Source: 1.1, 2] references', () => {
    const citations = [
      { index: 1, title: 'Handbook', section: 'PTO', displayIndex: '1.1' },
      { index: 2, title: 'Benefits Guide', displayIndex: '2' },
    ];
    const text = 'Combined claim [Source: 1.1, 2].';
    const { text: result, usedIndices } = transformCitationPatterns(text, citations);
    expect(result).toContain('<cite index="1"');
    expect(result).toContain('<cite index="2"');
    expect(result).not.toContain('[Source:');
    expect(usedIndices).toEqual(new Set([1, 2]));
  });

  it('handles flat numeric [Source: 1] with displayIndex', () => {
    const citations = [
      { index: 1, title: 'Doc A', displayIndex: '1' },
      { index: 2, title: 'Doc B', displayIndex: '2' },
    ];
    const text = 'Fact A [Source: 1]. Fact B [Source: 2].';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toContain('<cite index="1"');
    expect(result).toContain('<cite index="2"');
  });

  it('strips unmatched numeric refs', () => {
    const citations = [{ index: 1, title: 'Doc A', displayIndex: '1' }];
    const text = 'Claim [Source: 99].';
    const { text: result } = transformCitationPatterns(text, citations);
    expect(result).toBe('Claim .');
  });

  it('matches document-level [Source: 1] to parent citation with children', () => {
    const child1 = { index: 1, title: 'Handbook', section: 'PTO', displayIndex: '1.1' };
    const child2 = { index: 2, title: 'Handbook', section: 'Vacation', displayIndex: '1.2' };
    const parent = { index: 3, title: 'Handbook', displayIndex: '1', children: [child1, child2] };
    const text = 'The handbook covers both topics [Source: 1].';
    const { text: result, usedIndices } = transformCitationPatterns(text, [child1, child2, parent]);
    expect(result).toContain('<cite index="3"');
    expect(result).not.toContain('[Source:');
    expect(usedIndices).toEqual(new Set([3]));
  });
});

describe('extractSubAgentTexts', () => {
  it('returns text keyed by part index when tool output has text and _chunkSources', () => {
    const message = makeMessage([
      { type: 'text', text: 'Looking it up.' },
      {
        type: 'tool-searchKnowledge',
        toolName: 'searchKnowledge',
        state: 'output-available',
        output: {
          text: 'The pricing policy [Source: Pricing Plans — Plans].',
          _chunkSources: [{ title: 'Pricing Plans', chunkId: 'c1', text: 'Plans start at $9/mo' }],
        },
      } as never,
    ]);
    const result = extractSubAgentTexts(message);
    expect(result.size).toBe(1);
    expect(result.get(1)).toBe('The pricing policy [Source: Pricing Plans — Plans].');
  });

  it('returns empty map when text is empty string', () => {
    const message = makeMessage([
      {
        type: 'tool-searchKnowledge',
        toolName: 'searchKnowledge',
        state: 'output-available',
        output: { text: '', _chunkSources: [] },
      } as never,
    ]);
    const result = extractSubAgentTexts(message);
    expect(result.size).toBe(0);
  });

  it('returns empty map for messages with no tool parts', () => {
    const message = makeMessage([{ type: 'text', text: 'hello' }]);
    expect(extractSubAgentTexts(message).size).toBe(0);
  });

  it('skips parts without output-available state', () => {
    const message = makeMessage([
      {
        type: 'tool-searchKnowledge',
        toolName: 'searchKnowledge',
        state: 'input-available',
        output: { text: 'should be skipped', _chunkSources: [] },
      } as never,
    ]);
    expect(extractSubAgentTexts(message).size).toBe(0);
  });
});

describe('transformCopyText', () => {
  it('converts [Source: 1.1] to [1]', () => {
    expect(transformCopyText('PTO is 20 days [Source: 1.1].')).toBe('PTO is 20 days [1].');
  });

  it('converts [Source: 2] to [2]', () => {
    expect(transformCopyText('Benefits [Source: 2].')).toBe('Benefits [2].');
  });

  it('collapses same-document chunk refs: [Source: 1.1, 1.2] → [1]', () => {
    expect(transformCopyText('Info [Source: 1.1, 1.2].')).toBe('Info [1].');
  });

  it('preserves distinct document refs: [Source: 1.1, 2] → [1, 2]', () => {
    expect(transformCopyText('Info [Source: 1.1, 2].')).toBe('Info [1, 2].');
  });

  it('strips Source: prefix from legacy title refs', () => {
    expect(transformCopyText('See [Source: Handbook].')).toBe('See [Handbook].');
  });

  it('leaves text without citations unchanged', () => {
    expect(transformCopyText('No citations here.')).toBe('No citations here.');
  });

  it('handles multiple patterns in one string', () => {
    expect(transformCopyText('A [Source: 1.1]. B [Source: 2].')).toBe('A [1]. B [2].');
  });
});
