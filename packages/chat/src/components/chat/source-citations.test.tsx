import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CitationData } from '@typhoon/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceCitations } from './source-citations';

afterEach(cleanup);

function makeCitation(overrides: Partial<CitationData> & { index: number; title: string }): CitationData {
  return { ...overrides };
}

/** Safely find the closest `<button>` ancestor of an element. */
function closestButton(el: HTMLElement): HTMLElement {
  const btn = el.closest('button');
  if (!btn) throw new Error('Expected element to be inside a <button>');
  return btn;
}

describe('SourceCitations', () => {
  it('returns null when citations array is empty', () => {
    const { container } = render(<SourceCitations citations={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the citation count for a single source', () => {
    const citations: CitationData[] = [makeCitation({ index: 1, title: 'Handbook' })];

    render(<SourceCitations citations={citations} />);

    expect(screen.getByText('1 source')).toBeTruthy();
  });

  it('renders the citation count for multiple sources (plural)', () => {
    const citations: CitationData[] = [
      makeCitation({ index: 1, title: 'Handbook' }),
      makeCitation({ index: 2, title: 'Policy Guide' }),
      makeCitation({ index: 3, title: 'FAQ' }),
    ];

    render(<SourceCitations citations={citations} />);

    expect(screen.getByText('3 sources')).toBeTruthy();
  });

  it('does not show citation details until expanded', () => {
    const citations: CitationData[] = [makeCitation({ index: 1, title: 'Handbook' })];

    render(<SourceCitations citations={citations} />);

    expect(screen.queryByText('Handbook')).toBeNull();
  });

  it('shows citation details when the toggle button is clicked', () => {
    const citations: CitationData[] = [
      makeCitation({ index: 1, title: 'Handbook', source: 'handbook.pdf', displayIndex: '1' }),
    ];

    render(<SourceCitations citations={citations} />);

    const toggle = screen.getByText('1 source');
    fireEvent.click(closestButton(toggle));

    expect(screen.getByText('Handbook')).toBeTruthy();
    expect(screen.getByText('handbook.pdf')).toBeTruthy();
  });

  it('collapses citation details when clicked again', () => {
    const citations: CitationData[] = [makeCitation({ index: 1, title: 'Handbook', displayIndex: '1' })];

    render(<SourceCitations citations={citations} />);

    const toggle = closestButton(screen.getByText('1 source'));

    // Expand
    fireEvent.click(toggle);
    expect(screen.getByText('Handbook')).toBeTruthy();

    // Collapse
    fireEvent.click(toggle);
    expect(screen.queryByText('Handbook')).toBeNull();
  });

  it('calls onDocumentOpen with documentId when a citation row is clicked', () => {
    const onDocumentOpen = vi.fn();
    const citations: CitationData[] = [
      makeCitation({
        index: 1,
        title: 'Handbook',
        documentId: 'doc-1',
        startIndex: 42,
        chunkText: 'Some chunk',
        displayIndex: '1',
      }),
    ];

    render(<SourceCitations citations={citations} onDocumentOpen={onDocumentOpen} />);

    // Expand first
    fireEvent.click(closestButton(screen.getByText('1 source')));

    // Click the citation row
    fireEvent.click(closestButton(screen.getByText('Handbook')));

    expect(onDocumentOpen).toHaveBeenCalledWith('doc-1', {
      startIndex: 42,
      chunkText: 'Some chunk',
    });
  });

  it('does not call onDocumentOpen when documentId is missing', () => {
    const onDocumentOpen = vi.fn();
    const citations: CitationData[] = [makeCitation({ index: 1, title: 'Handbook', displayIndex: '1' })];

    render(<SourceCitations citations={citations} onDocumentOpen={onDocumentOpen} />);

    fireEvent.click(closestButton(screen.getByText('1 source')));
    fireEvent.click(closestButton(screen.getByText('Handbook')));

    expect(onDocumentOpen).not.toHaveBeenCalled();
  });

  it('passes chunks array for multi-chunk citations', () => {
    const onDocumentOpen = vi.fn();
    const citations: CitationData[] = [
      makeCitation({
        index: 1,
        title: 'Handbook',
        documentId: 'doc-1',
        displayIndex: '1',
        children: [
          makeCitation({ index: 2, title: 'Handbook', startIndex: 10, chunkText: 'Chunk A' }),
          makeCitation({ index: 3, title: 'Handbook', startIndex: 500, chunkText: 'Chunk B' }),
        ],
      }),
    ];

    render(<SourceCitations citations={citations} onDocumentOpen={onDocumentOpen} />);

    fireEvent.click(closestButton(screen.getByText('1 source')));
    fireEvent.click(closestButton(screen.getByText('Handbook')));

    expect(onDocumentOpen).toHaveBeenCalledWith('doc-1', {
      chunks: [
        { startIndex: 10, chunkText: 'Chunk A' },
        { startIndex: 500, chunkText: 'Chunk B' },
      ],
    });
  });

  it('shows citation count per row', () => {
    const citations: CitationData[] = [
      makeCitation({
        index: 1,
        title: 'Handbook',
        displayIndex: '1',
        children: [makeCitation({ index: 2, title: 'Handbook' }), makeCitation({ index: 3, title: 'Handbook' })],
      }),
    ];

    render(<SourceCitations citations={citations} />);
    fireEvent.click(closestButton(screen.getByText('1 source')));

    expect(screen.getByText('2 citations')).toBeTruthy();
  });

  it('shows syncSourceName when available', () => {
    const citations: CitationData[] = [
      makeCitation({
        index: 1,
        title: 'Handbook',
        syncSourceName: 'HR Documents',
        source: 'handbook.pdf',
        displayIndex: '1',
      }),
    ];

    render(<SourceCitations citations={citations} />);
    fireEvent.click(closestButton(screen.getByText('1 source')));

    expect(screen.getByText('HR Documents')).toBeTruthy();
  });

  it('falls back to source key when title is absent in display', () => {
    const citations: CitationData[] = [
      makeCitation({ index: 1, title: '', source: 'fallback-key.pdf', displayIndex: '1' }),
    ];

    render(<SourceCitations citations={citations} />);
    fireEvent.click(closestButton(screen.getByText('1 source')));

    // The component displays citation.title ?? sourceKey, so with empty title
    // it should fall back to the source key
    expect(screen.getByText('fallback-key.pdf')).toBeTruthy();
  });
});
