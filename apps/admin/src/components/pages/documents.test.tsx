import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => ({ syncTargetId: undefined, status: 'all' }),
}));
vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('./sync-source-detail/document-detail-sheet', () => ({
  DocumentDetailSheet: () => null,
}));
vi.mock('./sync-source-detail/shared', () => ({
  DOC_STATUS_MAP: { ready: 'success', error: 'error', processing: 'info', pending: 'pending' },
  formatBytes: vi.fn((n: number) => `${n} B`),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { AdminDocumentsPage } from './documents';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('AdminDocumentsPage', () => {
  it('renders document rows when data loads', async () => {
    // First call: documents, second call: sync-targets
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'docs/test.pdf',
          title: 'Test Doc',
          status: 'ready',
          chunkCount: 5,
          fileSize: 1024,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([{ id: 'st-1', name: 'Main Source', sourceType: 's3' }]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => expect(screen.getByText('Test Doc')).toBeTruthy());
  });

  it('shows empty state when no documents', async () => {
    mockApiFetch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => expect(screen.getByText('No documents')).toBeTruthy());
  });

  it('renders page title', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<AdminDocumentsPage />);
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('renders source column with sync target name', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'docs/readme.md',
          title: 'Readme',
          status: 'ready',
          chunkCount: 3,
          fileSize: 512,
          lastSyncedAt: '2025-01-01',
          mimeType: 'text/markdown',
        },
      ])
      .mockResolvedValueOnce([{ id: 'st-1', name: 'Knowledge Base', sourceType: 's3' }]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Knowledge Base')).toBeTruthy();
    });
  });

  it('renders status badges for different statuses', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-r',
          syncTargetId: 'st-1',
          sourceKey: 'ready.pdf',
          title: 'Ready Doc',
          status: 'ready',
          chunkCount: 5,
          fileSize: 1024,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
        },
        {
          id: 'doc-e',
          syncTargetId: 'st-1',
          sourceKey: 'error.pdf',
          title: 'Error Doc',
          status: 'error',
          chunkCount: 0,
          fileSize: 2048,
          lastSyncedAt: null,
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
      expect(screen.getByText('error')).toBeTruthy();
    });
  });

  it('renders sourceKey when document title is null', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'path/to/untitled.pdf',
          title: null,
          status: 'ready',
          chunkCount: 3,
          fileSize: 512,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('path/to/untitled.pdf')).toBeTruthy();
    });
  });

  it('renders last synced column with dash for null date', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'no-sync.pdf',
          title: 'Never Synced',
          status: 'pending',
          chunkCount: 0,
          fileSize: 256,
          lastSyncedAt: null,
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Never Synced')).toBeTruthy();
    });
    // Null lastSyncedAt should render a dash
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders chunk count and file size columns', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'large.pdf',
          title: 'Large Doc',
          status: 'ready',
          chunkCount: 42,
          fileSize: 2048,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeTruthy();
      expect(screen.getByText('2048 B')).toBeTruthy();
    });
  });

  it('renders column headers', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'test.pdf',
          title: 'Column Header Test',
          status: 'ready',
          chunkCount: 1,
          fileSize: 100,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Source')).toBeTruthy();
      expect(screen.getByText('Status')).toBeTruthy();
      expect(screen.getByText('Chunks')).toBeTruthy();
      expect(screen.getByText('Size')).toBeTruthy();
      expect(screen.getByText('Last Synced')).toBeTruthy();
    });
  });

  it('renders processing status badge', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-p',
          syncTargetId: 'st-1',
          sourceKey: 'proc.pdf',
          title: 'Processing Doc',
          status: 'processing',
          chunkCount: 0,
          fileSize: 500,
          lastSyncedAt: null,
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('processing')).toBeTruthy();
    });
  });

  it('renders pending status badge', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-pend',
          syncTargetId: 'st-1',
          sourceKey: 'pend.pdf',
          title: 'Pending Doc',
          status: 'pending',
          chunkCount: 0,
          fileSize: 100,
          lastSyncedAt: null,
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('pending')).toBeTruthy();
    });
  });

  it('renders multiple documents from different sources', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-1',
          syncTargetId: 'st-1',
          sourceKey: 'file1.pdf',
          title: 'Doc From Source A',
          status: 'ready',
          chunkCount: 5,
          fileSize: 1024,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
        },
        {
          id: 'doc-2',
          syncTargetId: 'st-2',
          sourceKey: 'file2.md',
          title: 'Doc From Source B',
          status: 'ready',
          chunkCount: 3,
          fileSize: 512,
          lastSyncedAt: '2025-01-02',
          mimeType: 'text/markdown',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'st-1', name: 'Source A', sourceType: 's3' },
        { id: 'st-2', name: 'Source B', sourceType: 's3' },
      ]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Doc From Source A')).toBeTruthy();
      expect(screen.getByText('Doc From Source B')).toBeTruthy();
      expect(screen.getByText('Source A')).toBeTruthy();
      expect(screen.getByText('Source B')).toBeTruthy();
    });
  });

  it('renders zero chunk count', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-z',
          syncTargetId: 'st-1',
          sourceKey: 'zero.pdf',
          title: 'Zero Chunks',
          status: 'pending',
          chunkCount: 0,
          fileSize: 256,
          lastSyncedAt: null,
          mimeType: 'application/pdf',
        },
      ])
      .mockResolvedValueOnce([]);
    renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Zero Chunks')).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });
  });

  it('shows RefreshCw icon in last synced column when document has searchMetaDirty: true', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-dirty',
          syncTargetId: 'st-1',
          sourceKey: 'dirty.pdf',
          title: 'Dirty Doc',
          status: 'ready',
          chunkCount: 5,
          fileSize: 1024,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
          searchMetaDirty: true,
        },
      ])
      .mockResolvedValueOnce([]);
    const { container } = renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Dirty Doc')).toBeTruthy();
    });
    // RefreshCwIcon renders with the lucide-refresh-cw class
    const refreshIcon = container.querySelector('.lucide-refresh-cw');
    expect(refreshIcon).toBeTruthy();
  });

  it('does NOT show RefreshCw icon when searchMetaDirty is false', async () => {
    mockApiFetch
      .mockResolvedValueOnce([
        {
          id: 'doc-clean',
          syncTargetId: 'st-1',
          sourceKey: 'clean.pdf',
          title: 'Clean Doc',
          status: 'ready',
          chunkCount: 5,
          fileSize: 1024,
          lastSyncedAt: '2025-01-01',
          mimeType: 'application/pdf',
          searchMetaDirty: false,
        },
      ])
      .mockResolvedValueOnce([]);
    const { container } = renderWithQueryClient(<AdminDocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('Clean Doc')).toBeTruthy();
    });
    const refreshIcon = container.querySelector('.lucide-refresh-cw');
    expect(refreshIcon).toBeNull();
  });
});
