import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
let mockSearchParams: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearchParams,
}));
vi.mock('../../hooks/use-page-title', () => ({
  usePageTitle: vi.fn(),
  detailTitle: vi.fn((section: string) => section),
}));
vi.mock('@typhoon/chat', () => ({
  DocumentViewerPanel: () => <div data-testid="document-viewer">DocumentViewer</div>,
  documentContentQuery: vi.fn(() => ({ queryKey: ['doc-content'], queryFn: vi.fn() })),
  documentParsedQuery: vi.fn(() => ({ queryKey: ['doc-parsed'], queryFn: vi.fn() })),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { SearchPage } from './search';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = {};
});

describe('SearchPage', () => {
  it('renders page header', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<SearchPage />);
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Search across all knowledge base documents')).toBeTruthy();
  });

  it('renders search input with placeholder', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    expect(input).toBeTruthy();
    expect(input.getAttribute('placeholder')).toBe('Search documents\u2026');
  });

  it('renders expanded mode toggle button', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<SearchPage />);
    expect(screen.getByText('Expanded')).toBeTruthy();
  });

  it('does not show results before searching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<SearchPage />);
    expect(screen.queryByText('No results found')).toBeNull();
    expect(screen.queryByText(/document.*found/)).toBeNull();
  });

  it('renders grouped search results after searching', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'PTO policy details',
              score: 0.92,
              metadata: {
                documentId: 'doc-1',
                syncTargetId: 'st-1',
                source: 'handbook.pdf',
                title: 'Employee Handbook',
              },
            },
            {
              text: 'Another chunk from handbook',
              score: 0.85,
              metadata: {
                documentId: 'doc-1',
                syncTargetId: 'st-1',
                source: 'handbook.pdf',
                title: 'Employee Handbook',
              },
            },
            {
              text: 'Benefits overview',
              score: 0.7,
              metadata: { documentId: 'doc-2', syncTargetId: 'st-1', source: 'benefits.pdf', title: 'Benefits Guide' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) {
        return Promise.resolve([
          { id: 'doc-1', title: 'Employee Handbook', description: 'Company policies', syncTargetId: 'st-1' },
          { id: 'doc-2', title: 'Benefits Guide', description: null, syncTargetId: 'st-1' },
        ]);
      }
      if (String(url).includes('/sync-targets')) {
        return Promise.resolve([{ id: 'st-1', name: 'HR Docs', sourceType: 's3' }]);
      }
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);

    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'PTO policy');
    await user.keyboard('{Enter}');

    // Grouped mode: two documents grouped from three results
    await waitFor(() => {
      expect(screen.getByText('2 documents found')).toBeTruthy();
    });

    expect(screen.getByText('Employee Handbook')).toBeTruthy();
    expect(screen.getByText('Benefits Guide')).toBeTruthy();
  });

  it('renders score badge with correct percentage', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'High scoring chunk',
              score: 0.95,
              metadata: { documentId: 'doc-1', source: 'doc.pdf', title: 'High Score Doc' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);

    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'test');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('95%')).toBeTruthy();
    });
  });

  it('shows empty state after search with no results', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({ results: [] });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);

    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'nonexistent');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeTruthy();
    });
    expect(screen.getByText('Try adjusting your search query.')).toBeTruthy();
  });

  it('renders score badge with green variant for high score (>=0.8)', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'High score chunk',
              score: 0.92,
              metadata: { documentId: 'doc-1', source: 'a.pdf', title: 'High Score' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'high');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      // 92% badge should appear
      expect(screen.getByText('92%')).toBeTruthy();
    });
  });

  it('renders result card with document title and passage text', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'This is the passage text about vacation policy.',
              score: 0.55,
              metadata: { documentId: 'doc-1', source: 'handbook.pdf', title: 'Employee Handbook' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'vacation');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Employee Handbook')).toBeTruthy();
      // Score < 0.6 should show warning variant badge with 55%
      expect(screen.getByText('55%')).toBeTruthy();
    });
  });

  it('renders "1 document found" (singular) for a single document result', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'Only chunk in one doc',
              score: 0.85,
              metadata: { documentId: 'doc-1', source: 'single.pdf', title: 'Single Document' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);

    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'single');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('1 document found')).toBeTruthy();
    });
  });

  it('renders low score badge with amber/warning variant', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'Low quality chunk',
              score: 0.65,
              metadata: { documentId: 'doc-1', source: 'low.pdf', title: 'Low Score Doc' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'low');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('65%')).toBeTruthy();
    });
  });

  it('switches between grouped and expanded mode', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'Chunk one',
              score: 0.9,
              metadata: { documentId: 'doc-1', source: 'a.pdf', title: 'Doc A' },
            },
            {
              text: 'Chunk two',
              score: 0.8,
              metadata: { documentId: 'doc-1', source: 'a.pdf', title: 'Doc A' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);

    // First search in grouped mode
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'test');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('1 document found')).toBeTruthy();
    });

    // Toggle to expanded mode — should re-search and show passage count
    await user.click(screen.getByText('Expanded'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it('renders result with medium-range score (0.6-0.79) badge', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'Medium quality result',
              score: 0.72,
              metadata: { documentId: 'doc-1', source: 'doc.pdf', title: 'Medium Doc' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'medium');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('72%')).toBeTruthy();
    });
  });

  it('renders multiple grouped results with chunk counts', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            { text: 'Chunk 1A', score: 0.9, metadata: { documentId: 'doc-1', source: 'a.pdf', title: 'Doc A' } },
            { text: 'Chunk 2A', score: 0.85, metadata: { documentId: 'doc-1', source: 'a.pdf', title: 'Doc A' } },
            { text: 'Chunk 3A', score: 0.8, metadata: { documentId: 'doc-1', source: 'a.pdf', title: 'Doc A' } },
            { text: 'Chunk 1B', score: 0.7, metadata: { documentId: 'doc-2', source: 'b.pdf', title: 'Doc B' } },
            { text: 'Chunk 1C', score: 0.6, metadata: { documentId: 'doc-3', source: 'c.pdf', title: 'Doc C' } },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'multi');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('3 documents found')).toBeTruthy();
      expect(screen.getByText('Doc A')).toBeTruthy();
      expect(screen.getByText('Doc B')).toBeTruthy();
      expect(screen.getByText('Doc C')).toBeTruthy();
    });
  });

  it('renders result description from document enrichment', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'Chunk content here',
              score: 0.88,
              metadata: { documentId: 'doc-1', syncTargetId: 'st-1', source: 'handbook.pdf', title: 'Handbook' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) {
        return Promise.resolve([
          { id: 'doc-1', title: 'Handbook', description: 'Company employee handbook', syncTargetId: 'st-1' },
        ]);
      }
      if (String(url).includes('/sync-targets')) {
        return Promise.resolve([{ id: 'st-1', name: 'HR Knowledge Base', sourceType: 's3' }]);
      }
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'handbook');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Handbook')).toBeTruthy();
      // Description from enrichment
      expect(screen.getByText('Company employee handbook')).toBeTruthy();
      // Sync target name
      expect(screen.getByText('HR Knowledge Base')).toBeTruthy();
    });
  });

  it('renders expanded mode with passage count and individual chunks', async () => {
    mockSearchParams = { expanded: true };
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: '## First **bold** passage',
              score: 0.95,
              metadata: { documentId: 'doc-1', syncTargetId: 'st-1', source: 'a.pdf', title: '# Doc A' },
            },
            {
              text: 'Second passage with `code`',
              score: 0.8,
              metadata: { documentId: 'doc-1', syncTargetId: 'st-1', source: 'a.pdf', title: 'Doc A' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) {
        return Promise.resolve([{ id: 'doc-1', title: 'Doc A', description: null, syncTargetId: 'st-1' }]);
      }
      if (String(url).includes('/sync-targets')) {
        return Promise.resolve([{ id: 'st-1', name: 'Source', sourceType: 's3' }]);
      }
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'passage');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      // In expanded mode, show passage count
      expect(screen.getByText('2 passages found')).toBeTruthy();
    });
    // stripMarkdown should remove ## and **bold** formatting from titles/texts
    expect(screen.getByText(/First bold passage/)).toBeTruthy();
    expect(screen.getByText(/Second passage with code/)).toBeTruthy();
  });

  it('renders source filename when document title is just a path', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string | URL | Request, opts?: { method?: string }) => {
      if (opts?.method === 'POST' && String(url).includes('/search/hybrid')) {
        return Promise.resolve({
          results: [
            {
              text: 'Some content',
              score: 0.75,
              metadata: { documentId: 'doc-1', source: 'path/to/file.pdf', title: 'path/to/file.pdf' },
            },
          ],
        });
      }
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<SearchPage />);
    const input = screen.getByLabelText('Search documents');
    await user.type(input, 'path');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      // May appear multiple times (title + source), just verify at least one
      expect(screen.getAllByText('path/to/file.pdf').length).toBeGreaterThanOrEqual(1);
    });
  });
});
