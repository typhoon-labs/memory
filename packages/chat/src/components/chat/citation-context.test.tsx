import { cleanup, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CitationProvider, useCitations } from './citation-context';

afterEach(cleanup);

describe('useCitations', () => {
  it('returns empty citations map by default', () => {
    const { result } = renderHook(() => useCitations());
    expect(result.current.citations.size).toBe(0);
    expect(result.current.onDocumentOpen).toBeUndefined();
  });

  it('returns provided citations from CitationProvider', () => {
    const citations = new Map([
      [1, { index: 1, title: 'Doc A', displayIndex: '1' }],
      [2, { index: 2, title: 'Doc B', displayIndex: '2' }],
    ]);
    const { result } = renderHook(() => useCitations(), {
      wrapper: ({ children }) => <CitationProvider citations={citations}>{children}</CitationProvider>,
    });
    expect(result.current.citations.size).toBe(2);
    expect(result.current.citations.get(1)?.title).toBe('Doc A');
    expect(result.current.citations.get(2)?.title).toBe('Doc B');
  });

  it('returns onDocumentOpen callback from provider', () => {
    const onOpen = vi.fn();
    const citations = new Map();
    const { result } = renderHook(() => useCitations(), {
      wrapper: ({ children }) => (
        <CitationProvider citations={citations} onDocumentOpen={onOpen}>
          {children}
        </CitationProvider>
      ),
    });
    expect(result.current.onDocumentOpen).toBe(onOpen);
  });
});

describe('CitationProvider', () => {
  it('renders children', () => {
    render(
      <CitationProvider citations={new Map()}>
        <div data-testid="child">Hello</div>
      </CitationProvider>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});
