import { describe, expect, it } from 'vitest';

import { type ViewerChunk, cycleIndex, resolveChunkLines } from './viewer-utils';

// ── resolveChunkLines ─────────────────────────────────────────────

describe('resolveChunkLines', () => {
  const chunks: ViewerChunk[] = [
    { text: 'First chunk with enough text to be meaningful for testing purposes.', startIndex: 0 },
    { text: '## Heading Two\n\nSome paragraph text that is long enough to pass the filter.', startIndex: 100 },
    { text: '- Bullet one item with text\n- Bullet two item with text\n- Bullet three', startIndex: 300 },
    { text: 'Short', startIndex: 500 },
  ];

  it('finds chunk by exact startIndex match', () => {
    const lines = resolveChunkLines(chunks, 100, undefined);
    // The heading should be stripped, leaving "Heading Two" and the paragraph
    expect(lines).toContain('Heading Two');
    expect(lines).toContain('Some paragraph text that is long enough to pass the filter.');
  });

  it('finds closest chunk when startIndex is within 200', () => {
    // startIndex 150 is closest to chunk at 100 (distance 50 < 200)
    const lines = resolveChunkLines(chunks, 150, undefined);
    expect(lines).toContain('Heading Two');
  });

  it('does not find chunk when startIndex distance exceeds 200', () => {
    // startIndex 800 is not within 200 of any chunk
    const lines = resolveChunkLines(chunks, 800, undefined);
    expect(lines).toEqual([]);
  });

  it('falls back to chunkText match when startIndex misses', () => {
    const lines = resolveChunkLines(
      chunks,
      9999,
      '## Heading Two\n\nSome paragraph text that is long enough to pass the filter.',
    );
    expect(lines).toContain('Heading Two');
  });

  it('matches chunk by chunkText prefix when no startIndex', () => {
    const lines = resolveChunkLines(
      chunks,
      undefined,
      'First chunk with enough text to be meaningful for testing purposes.',
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).toContain('First chunk with enough text to be meaningful for testing purposes.');
  });

  it('returns empty array when no match is found', () => {
    const lines = resolveChunkLines(chunks, undefined, undefined);
    expect(lines).toEqual([]);
  });

  it('returns empty array when both startIndex and chunkText are undefined', () => {
    const lines = resolveChunkLines([], undefined, undefined);
    expect(lines).toEqual([]);
  });

  it('strips markdown headings', () => {
    const lines = resolveChunkLines(
      [{ text: '### My Important Heading\n\nBody text that is long enough to pass.', startIndex: 0 }],
      0,
      undefined,
    );
    expect(lines).toContain('My Important Heading');
    // Should NOT contain the ### prefix
    expect(lines.some((l) => l.startsWith('###'))).toBe(false);
  });

  it('strips bold and italic markers', () => {
    const lines = resolveChunkLines(
      [{ text: '**Bold text here** and *italic text there* enough length to pass', startIndex: 0 }],
      0,
      undefined,
    );
    expect(lines).toContain('Bold text here and italic text there enough length to pass');
  });

  it('strips bullet markers', () => {
    const lines = resolveChunkLines(
      [
        {
          text: '- Bullet item with sufficient text\n* Star bullet with sufficient text\n+ Plus bullet sufficient text',
          startIndex: 0,
        },
      ],
      0,
      undefined,
    );
    expect(lines).toContain('Bullet item with sufficient text');
    expect(lines).toContain('Star bullet with sufficient text');
    expect(lines).toContain('Plus bullet sufficient text');
  });

  it('strips markdown links', () => {
    const lines = resolveChunkLines(
      [{ text: 'Click [the important link](https://example.com) for more information.', startIndex: 0 }],
      0,
      undefined,
    );
    expect(lines).toContain('Click the important link for more information.');
  });

  it('replaces pipe characters with spaces', () => {
    const lines = resolveChunkLines(
      [{ text: 'Column A | Column B | Column C are all present', startIndex: 0 }],
      0,
      undefined,
    );
    expect(lines[0]).not.toContain('|');
  });

  it('filters out blank and short lines (< 8 chars)', () => {
    const lines = resolveChunkLines(
      [
        {
          text: 'OK\n\nThis line is long enough to survive\n\nNo\n\n\n\nAnother long enough line to survive',
          startIndex: 0,
        },
      ],
      0,
      undefined,
    );
    expect(lines).toEqual(['This line is long enough to survive', 'Another long enough line to survive']);
  });

  it('returns empty array with empty chunks array and no chunkText', () => {
    const lines = resolveChunkLines([], 50, undefined);
    expect(lines).toEqual([]);
  });

  it('uses chunkText directly when chunks array is empty', () => {
    const lines = resolveChunkLines([], undefined, 'Fallback text that is long enough to pass the filter.');
    expect(lines).toContain('Fallback text that is long enough to pass the filter.');
  });
});

// ── cycleIndex ────────────────────────────────────────────────────

describe('cycleIndex', () => {
  it('moves forward from 0 to 1', () => {
    expect(cycleIndex(0, 5, 'next')).toBe(1);
  });

  it('wraps forward from N-1 to 0', () => {
    expect(cycleIndex(4, 5, 'next')).toBe(0);
  });

  it('moves backward from N-1 to N-2', () => {
    expect(cycleIndex(4, 5, 'prev')).toBe(3);
  });

  it('wraps backward from 0 to N-1', () => {
    expect(cycleIndex(0, 5, 'prev')).toBe(4);
  });

  it('handles single item (total=1) going forward', () => {
    expect(cycleIndex(0, 1, 'next')).toBe(0);
  });

  it('handles single item (total=1) going backward', () => {
    expect(cycleIndex(0, 1, 'prev')).toBe(0);
  });

  it('returns 0 when total is 0', () => {
    expect(cycleIndex(0, 0, 'next')).toBe(0);
    expect(cycleIndex(0, 0, 'prev')).toBe(0);
  });

  it('cycles through all indices forward', () => {
    const total = 4;
    let idx = 0;
    const visited: number[] = [idx];
    for (let i = 0; i < total; i++) {
      idx = cycleIndex(idx, total, 'next');
      visited.push(idx);
    }
    // Should visit 0 -> 1 -> 2 -> 3 -> 0
    expect(visited).toEqual([0, 1, 2, 3, 0]);
  });

  it('cycles through all indices backward', () => {
    const total = 4;
    let idx = 0;
    const visited: number[] = [idx];
    for (let i = 0; i < total; i++) {
      idx = cycleIndex(idx, total, 'prev');
      visited.push(idx);
    }
    // Should visit 0 -> 3 -> 2 -> 1 -> 0
    expect(visited).toEqual([0, 3, 2, 1, 0]);
  });
});
