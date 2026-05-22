import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@typhoon/chat', () => ({
  CitationProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="citation-provider">{children}</div>
  ),
  SourceCitations: ({ citations }: { citations: unknown[] }) => (
    <div data-testid="source-citations">{citations.length} citations</div>
  ),
  StreamdownText: ({ text }: { text: string }) => <div data-testid="streamdown-text">{text}</div>,
  transformCitationPatterns: (text: string, citations: Array<{ index: number }>) => ({
    text: `transformed:${text}`,
    usedIndices: new Set(citations.map((c) => c.index)),
  }),
}));

vi.mock('@typhoon/ui', () => ({
  MarkdownContent: ({ text }: { text: string }) => <div data-testid="markdown-content">{text}</div>,
}));

afterEach(cleanup);

// ── Import under test ─────────────────────────────────────────────────────────

import type { SourceEntry } from './response-with-citations';
import { ResponseWithCitations } from './response-with-citations';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    chunkId: 'chunk-1',
    displayIndex: '1',
    title: 'Document A',
    source: 'docs/a.pdf',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ResponseWithCitations', () => {
  it('renders MarkdownContent fallback when no sources', () => {
    render(<ResponseWithCitations text="Hello world" />);

    expect(screen.getByTestId('markdown-content').textContent).toBe('Hello world');
    expect(screen.queryByTestId('citation-provider')).toBeNull();
  });

  it('renders MarkdownContent fallback when sources is empty array', () => {
    render(<ResponseWithCitations text="Hello world" sources={[]} />);

    expect(screen.getByTestId('markdown-content').textContent).toBe('Hello world');
  });

  it('renders citation components when sources are provided', () => {
    const sources = [makeSource()];
    render(<ResponseWithCitations text="Answer [Source: 1]" sources={sources} />);

    expect(screen.getByTestId('citation-provider')).toBeTruthy();
    expect(screen.getByTestId('streamdown-text')).toBeTruthy();
    expect(screen.getByTestId('source-citations')).toBeTruthy();
    expect(screen.queryByTestId('markdown-content')).toBeNull();
  });

  it('passes transformed text to StreamdownText', () => {
    const sources = [makeSource()];
    render(<ResponseWithCitations text="Answer" sources={sources} />);

    expect(screen.getByTestId('streamdown-text').textContent).toBe('transformed:Answer');
  });

  it('renders multiple sources', () => {
    const sources = [
      makeSource({ chunkId: 'c1', displayIndex: '1' }),
      makeSource({ chunkId: 'c2', displayIndex: '2', title: 'Document B' }),
    ];
    render(<ResponseWithCitations text="Answer" sources={sources} />);

    expect(screen.getByTestId('source-citations').textContent).toBe('2 citations');
  });

  it('handles sources with multi-chunk display indices', () => {
    const sources = [
      makeSource({ chunkId: 'c1', displayIndex: '1.1' }),
      makeSource({ chunkId: 'c2', displayIndex: '1.2' }),
      makeSource({ chunkId: 'c3', displayIndex: '2' }),
    ];
    render(<ResponseWithCitations text="Answer" sources={sources} />);

    // 3 chunk citations + 1 parent citation (for 1.1 and 1.2) = 4 total
    expect(screen.getByTestId('source-citations').textContent).toBe('4 citations');
  });

  it('does not create parent for single-chunk documents', () => {
    const sources = [
      makeSource({ chunkId: 'c1', displayIndex: '1.1' }),
      makeSource({ chunkId: 'c2', displayIndex: '2' }),
    ];
    render(<ResponseWithCitations text="Answer" sources={sources} />);

    // 2 chunks, no parent (1.1 is alone in its group)
    expect(screen.getByTestId('source-citations').textContent).toBe('2 citations');
  });
});
