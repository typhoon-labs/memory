import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => ({}),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
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
    useUrlSearchInput: () => ({
      inputValue: '',
      setInputValue: vi.fn(),
      handleKeyDown: vi.fn(),
      handleBlur: vi.fn(),
    }),
  };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { DocumentsPage } from './documents';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('DocumentsPage', () => {
  it('renders page header', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<DocumentsPage />);
    expect(screen.getByText('Documents')).toBeTruthy();
    expect(screen.getByText('All documents available to ask questions about')).toBeTruthy();
  });

  it('shows loading spinner while fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<DocumentsPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders document table when data loads', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'file.pdf',
            title: 'Test Document',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets'))
        return Promise.resolve([{ id: 'st-1', name: 'My Source', sourceType: 's3' }]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    // Wait for document data to appear
    const docTitle = await screen.findByText('Test Document');
    expect(docTitle).toBeTruthy();
  });

  it('shows empty state when no documents exist', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    const emptyTitle = await screen.findByText('No documents yet');
    expect(emptyTitle).toBeTruthy();
  });

  it('renders source and type filter dropdowns', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'file.pdf',
            title: 'Test Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 2048,
            lastSyncedAt: null,
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets'))
        return Promise.resolve([{ id: 'st-1', name: 'S3 Bucket', sourceType: 's3' }]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    // Wait for data to load
    await screen.findByText('Test Doc');

    // Source filter should be rendered with "All sources" as placeholder/default
    expect(screen.getByText('All sources')).toBeTruthy();
    // Type filter should be rendered with "All types" as placeholder/default
    expect(screen.getByText('All types')).toBeTruthy();
  });

  it('renders document type column based on MIME type', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'handbook.pdf',
            title: 'PDF Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'doc-2',
            syncTargetId: 'st-1',
            sourceKey: 'notes.md',
            title: 'Markdown Doc',
            mimeType: 'text/markdown',
            status: 'ready',
            fileSize: 512,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets'))
        return Promise.resolve([{ id: 'st-1', name: 'Source A', sourceType: 's3' }]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    await screen.findByText('PDF Doc');

    // MIME type classification
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.getByText('Markdown')).toBeTruthy();
  });

  it('renders processing status for pending documents', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'processing.pdf',
            title: 'Processing Doc',
            mimeType: 'application/pdf',
            status: 'processing',
            fileSize: 1024,
            lastSyncedAt: null,
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    await screen.findByText('Processing Doc');
    expect(screen.getByText('Processing')).toBeTruthy();
  });

  it('renders error status for errored documents', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'broken.pdf',
            title: 'Broken Doc',
            mimeType: 'application/pdf',
            status: 'error',
            fileSize: 1024,
            lastSyncedAt: null,
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    await screen.findByText('Broken Doc');
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });

  it('renders file size formatted correctly', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'large.pdf',
            title: 'Large File',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1_500_000,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    await screen.findByText('Large File');
    expect(screen.getByText('1.4 MB')).toBeTruthy();
  });

  it('renders source filter with sync target names', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'file.pdf',
            title: 'Test Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets'))
        return Promise.resolve([
          { id: 'st-1', name: 'HR Documents', sourceType: 's3' },
          { id: 'st-2', name: 'Legal Docs', sourceType: 's3' },
        ]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    await screen.findByText('Test Doc');
    // Source filter should show "All sources" placeholder
    expect(screen.getByText('All sources')).toBeTruthy();
  });

  it('renders source column with sync target name', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'file.pdf',
            title: 'Sourced Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets'))
        return Promise.resolve([{ id: 'st-1', name: 'Knowledge Base', sourceType: 's3' }]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Sourced Doc');
    expect(screen.getByText('Knowledge Base')).toBeTruthy();
  });

  it('renders sourceKey when document title is null', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'path/to/untitled.pdf',
            title: null,
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);
    expect(await screen.findByText('path/to/untitled.pdf')).toBeTruthy();
  });

  it('renders dash for null fileSize', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'nosize.pdf',
            title: 'No Size Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: null,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('No Size Doc');
    // null fileSize should render a dash
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('filters out deleted documents', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'active.pdf',
            title: 'Active Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'doc-2',
            syncTargetId: 'st-1',
            sourceKey: 'deleted.pdf',
            title: 'Deleted Doc',
            mimeType: 'application/pdf',
            status: 'deleted',
            fileSize: 512,
            lastSyncedAt: null,
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DocumentsPage />);

    await screen.findByText('Active Doc');
    await waitFor(() => {
      expect(screen.queryByText('Deleted Doc')).toBeNull();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'file.pdf',
            title: 'Col Test',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Col Test');
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Size')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
  });

  it('renders text/plain as Plain Text type', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'notes.txt',
            title: 'Plain Text Doc',
            mimeType: 'text/plain',
            status: 'ready',
            fileSize: 256,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Plain Text Doc');
    expect(screen.getByText('Text')).toBeTruthy();
  });

  it('renders ready status with relative time', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'ready.pdf',
            title: 'Ready Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Ready Doc');
    // Ready status shows a relative time, not a badge — the row should render
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('renders multiple documents from same source', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'a.pdf',
            title: 'First Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'doc-2',
            syncTargetId: 'st-1',
            sourceKey: 'b.pdf',
            title: 'Second Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 2048,
            lastSyncedAt: '2025-01-02T00:00:00Z',
            updatedAt: '2025-01-02T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets'))
        return Promise.resolve([{ id: 'st-1', name: 'Main', sourceType: 's3' }]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('First Doc');
    expect(screen.getByText('Second Doc')).toBeTruthy();
  });

  it('renders KB-sized file correctly', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'kb.pdf',
            title: 'KB Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 5120,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('KB Doc');
    expect(screen.getByText('5.0 KB')).toBeTruthy();
  });

  it('renders Word MIME type correctly', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'contract.docx',
            title: 'Word Doc',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            status: 'ready',
            fileSize: 4096,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Word Doc');
    expect(screen.getByText('Word')).toBeTruthy();
  });

  it('renders Spreadsheet MIME type correctly', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'data.xlsx',
            title: 'Spreadsheet Doc',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            status: 'ready',
            fileSize: 8192,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Spreadsheet Doc');
    expect(screen.getByText('Spreadsheet')).toBeTruthy();
  });

  it('renders Other for unknown MIME type', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'binary.bin',
            title: 'Unknown Type',
            mimeType: 'application/octet-stream',
            status: 'ready',
            fileSize: 512,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Unknown Type');
    expect(screen.getByText('Other')).toBeTruthy();
  });

  it('renders dash for null MIME type', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'no-mime.file',
            title: 'No MIME',
            mimeType: null,
            status: 'ready',
            fileSize: null,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('No MIME');
    // Both type and size should show dashes
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders dash for source column when sync target not found', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-unknown',
            sourceKey: 'orphan.pdf',
            title: 'Orphan Doc',
            mimeType: 'application/pdf',
            status: 'ready',
            fileSize: 1024,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Orphan Doc');
    // Source column should show dash when target not found
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders byte-sized file correctly', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'tiny.txt',
            title: 'Tiny Doc',
            mimeType: 'text/plain',
            status: 'ready',
            fileSize: 512,
            lastSyncedAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Tiny Doc');
    expect(screen.getByText('512 B')).toBeTruthy();
  });

  it('renders pending status as Processing badge', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([
          {
            id: 'doc-1',
            syncTargetId: 'st-1',
            sourceKey: 'pend.pdf',
            title: 'Pending Doc',
            mimeType: 'application/pdf',
            status: 'pending',
            fileSize: 256,
            lastSyncedAt: null,
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ]);
      if (String(url).includes('/sync-targets')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderWithQueryClient(<DocumentsPage />);
    await screen.findByText('Pending Doc');
    // In desk, pending shows as "Processing" badge
    expect(screen.getByText('Processing')).toBeTruthy();
  });
});
