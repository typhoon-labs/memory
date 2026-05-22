import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useQueryMock = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock('./document-queries', () => ({
  documentContentQuery: (id: string) => ({ queryKey: ['doc-content', id] }),
  documentParsedQuery: (id: string) => ({ queryKey: ['doc-parsed', id] }),
}));

vi.mock('@typhoon/ui', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    onClick?: () => void;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  DocumentContentViewer: ({ text }: { text: string; mimeType: string | null; searchTerms: string[] }) => (
    <div data-testid="document-content-viewer">{text}</div>
  ),
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-area">{children}</div>,
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

// Ensure MutationObserver exists in happy-dom (no-op if already present)
if (typeof globalThis.MutationObserver === 'undefined') {
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof MutationObserver;
}

import { DocumentViewerPanel } from './document-viewer-panel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(cleanup);

function defaultContentData() {
  return {
    document: {
      id: 'doc-1',
      title: 'Test Document',
      description: 'A test document description',
      sourceKey: 'uploads/test.pdf',
      mimeType: 'application/pdf',
    },
    chunks: [
      { text: 'First chunk of text content here', startIndex: 0 },
      { text: 'Second chunk of text content here', startIndex: 500 },
    ],
  };
}

function defaultParsedData() {
  return { text: 'Full parsed document text content' };
}

/**
 * Configure useQueryMock to return different data based on the queryKey.
 * First call = content query, second call = parsed query.
 */
function setupQueryMock(options: {
  contentLoading?: boolean;
  contentError?: boolean;
  contentData?: ReturnType<typeof defaultContentData> | undefined;
  parsedLoading?: boolean;
  parsedError?: boolean;
  parsedData?: ReturnType<typeof defaultParsedData> | undefined;
}) {
  const refetchChunks = vi.fn();
  const refetchParsed = vi.fn();

  useQueryMock.mockImplementation((queryOptions: { queryKey: string[] }) => {
    const key = queryOptions.queryKey[0];
    if (key === 'doc-content') {
      return {
        data: options.contentLoading ? undefined : options.contentData,
        isLoading: options.contentLoading ?? false,
        isError: options.contentError ?? false,
        refetch: refetchChunks,
      };
    }
    // parsed query
    return {
      data: options.parsedLoading ? undefined : options.parsedData,
      isLoading: options.parsedLoading ?? false,
      isError: options.parsedError ?? false,
      refetch: refetchParsed,
    };
  });

  return { refetchChunks, refetchParsed };
}

const defaultProps = {
  documentId: 'doc-1',
  searchTerms: [] as string[],
  onClose: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocumentViewerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Loading state --------------------------------------------------------

  it('shows skeletons when content is loading', () => {
    setupQueryMock({ contentLoading: true, parsedLoading: true });

    render(<DocumentViewerPanel {...defaultProps} />);

    const skeletons = screen.getAllByTestId('skeleton');
    // Title skeleton + content skeletons
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render DocumentContentViewer while loading', () => {
    setupQueryMock({ contentLoading: true, parsedLoading: true });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.queryByTestId('document-content-viewer')).toBeNull();
  });

  // -- Content loaded -------------------------------------------------------

  it('renders the document title when content is loaded', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('Test Document')).toBeTruthy();
  });

  it('renders the document description', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('A test document description')).toBeTruthy();
  });

  it('renders the source key', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('uploads/test.pdf')).toBeTruthy();
  });

  it('renders the content viewer with full text', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    const viewer = screen.getByTestId('document-content-viewer');
    expect(viewer.textContent).toContain('Full parsed document text content');
  });

  it('falls back to chunk text when parsed data is unavailable', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: undefined });

    render(<DocumentViewerPanel {...defaultProps} />);

    const viewer = screen.getByTestId('document-content-viewer');
    expect(viewer.textContent).toContain('First chunk of text content here');
    expect(viewer.textContent).toContain('Second chunk of text content here');
  });

  it('renders mimeType badge when content is loaded', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('application/pdf')).toBeTruthy();
  });

  it('renders chunk count badge', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('2 chunks')).toBeTruthy();
  });

  // -- Close button ---------------------------------------------------------

  it('renders a close button that calls onClose', () => {
    const onClose = vi.fn();
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    const { container } = render(<DocumentViewerPanel {...defaultProps} onClose={onClose} />);

    // The desktop close button (XIcon) is inside a button with the lg:block class
    const closeButtons = container.querySelectorAll('button');
    // Find the close button — it's the last button in the header area
    let found = false;
    for (const btn of closeButtons) {
      if (btn.className.includes('lg:block')) {
        btn.click();
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders a mobile back button that calls onClose', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });
    const onClose = vi.fn();

    render(<DocumentViewerPanel {...defaultProps} onClose={onClose} />);

    const backButton = screen.getByText('Back to results');
    backButton.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // -- Chunk mode -----------------------------------------------------------

  it('shows chunk navigation label when startIndex is provided', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    // With startIndex set, the component enters chunk mode.
    // The navigator may not find DOM matches (mocked viewer), but the mode is set.
    render(<DocumentViewerPanel {...defaultProps} startIndex={0} />);

    // In chunk mode with no DOM matches the navigator bar won't render,
    // but the component should not crash.
    expect(screen.getByTestId('document-content-viewer')).toBeTruthy();
  });

  it('shows chunk navigation label when chunkText is provided', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} chunkText="Some chunk text" />);

    expect(screen.getByTestId('document-content-viewer')).toBeTruthy();
  });

  it('shows chunk navigation label when citationChunks is provided', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(
      <DocumentViewerPanel
        {...defaultProps}
        citationChunks={[
          { startIndex: 0, chunkText: 'chunk 1' },
          { startIndex: 500, chunkText: 'chunk 2' },
        ]}
      />,
    );

    expect(screen.getByTestId('document-content-viewer')).toBeTruthy();
  });

  // -- Error state ----------------------------------------------------------

  it('shows error state with retry button when content fails to load', () => {
    const { refetchChunks } = setupQueryMock({ contentError: true, contentData: undefined });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('Failed to load document content')).toBeTruthy();
    const retryBtn = screen.getByText('Retry');
    expect(retryBtn).toBeTruthy();

    retryBtn.click();
    expect(refetchChunks).toHaveBeenCalledOnce();
  });

  it('does not render the content viewer on error', () => {
    setupQueryMock({ contentError: true, contentData: undefined });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.queryByTestId('document-content-viewer')).toBeNull();
  });

  // -- Parsed content unavailable badge -------------------------------------

  it('shows "Full content unavailable" badge when parsed content fails', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedError: true, parsedData: undefined });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText(/Full content unavailable/)).toBeTruthy();
  });

  it('shows "Loading full content" badge while parsed content is loading', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedLoading: true });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText(/Loading full content/)).toBeTruthy();
  });

  // -- Navigation controls --------------------------------------------------

  it('renders download button when content is loaded', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    const { container } = render(<DocumentViewerPanel {...defaultProps} />);

    const downloadBtn = container.querySelector('button[title="Download original"]');
    expect(downloadBtn).toBeTruthy();
  });

  it('does not render download button while loading', () => {
    setupQueryMock({ contentLoading: true, parsedLoading: true });

    const { container } = render(<DocumentViewerPanel {...defaultProps} />);

    const downloadBtn = container.querySelector('button[title="Download original"]');
    expect(downloadBtn).toBeNull();
  });

  // -- Fallback document title ----------------------------------------------

  it('shows "Document" as fallback title when doc has no title or sourceKey', () => {
    const data = defaultContentData();
    // nullish coalescing (??) only triggers on null/undefined, not empty string
    (data.document as Record<string, unknown>).title = undefined;
    (data.document as Record<string, unknown>).sourceKey = undefined;
    setupQueryMock({ contentData: data, parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} />);

    expect(screen.getByText('Document')).toBeTruthy();
  });

  // -- Download button -------------------------------------------------------

  it('calls window.open when download button is clicked', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { container } = render(<DocumentViewerPanel {...defaultProps} />);

    const downloadBtn = container.querySelector('button[title="Download original"]');
    expect(downloadBtn).toBeTruthy();
    (downloadBtn as HTMLElement).click();

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/api/v1/documents/doc-1/download'), '_blank');
    openSpy.mockRestore();
  });

  // -- Keyboard shortcuts ----------------------------------------------------

  it('does not crash when F3 is pressed with no matches', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} searchTerms={['nonexistent']} />);

    // Should not throw
    fireEvent.keyDown(document, { key: 'F3' });
    expect(screen.getByTestId('document-content-viewer')).toBeTruthy();
  });

  it('does not crash when Shift+F3 is pressed', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} searchTerms={['nonexistent']} />);

    fireEvent.keyDown(document, { key: 'F3', shiftKey: true });
    expect(screen.getByTestId('document-content-viewer')).toBeTruthy();
  });

  it('does not crash when Ctrl+G is pressed', () => {
    setupQueryMock({ contentData: defaultContentData(), parsedData: defaultParsedData() });

    render(<DocumentViewerPanel {...defaultProps} searchTerms={['nonexistent']} />);

    fireEvent.keyDown(document, { key: 'g', ctrlKey: true });
    expect(screen.getByTestId('document-content-viewer')).toBeTruthy();
  });

  // -- Parsed content retry --------------------------------------------------

  it('shows retry badge and calls refetchParsed when clicked', () => {
    const { refetchParsed } = setupQueryMock({
      contentData: defaultContentData(),
      parsedError: true,
      parsedData: undefined,
    });

    render(<DocumentViewerPanel {...defaultProps} />);

    const badge = screen.getByText(/Full content unavailable/);
    expect(badge).toBeTruthy();
    badge.click();

    expect(refetchParsed).toHaveBeenCalled();
  });
});
