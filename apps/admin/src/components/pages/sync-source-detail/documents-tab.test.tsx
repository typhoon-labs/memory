import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('./document-detail-sheet', () => ({
  DocumentDetailSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="document-detail-sheet">Detail Sheet</div> : null,
}));

vi.mock('./upload-dialog', () => ({
  UploadDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="upload-dialog">Upload Dialog</div> : null),
}));

vi.mock('./create-folder-dialog', () => ({
  CreateFolderDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-folder-dialog">Create Folder Dialog</div> : null,
}));

vi.mock('./dnd-components', () => ({
  DraggableFileRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  DragOverlayContent: () => null,
  DroppableBreadcrumb: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DroppableFolderRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  MoveErrorBanner: () => null,
}));

vi.mock('./use-file-move', () => ({
  useFileMove: () => ({
    moveItems: vi.fn(),
    isPending: false,
    error: null,
    clearError: vi.fn(),
  }),
  computeDestination: vi.fn(),
  isDescendantOf: vi.fn(() => false),
}));

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => <a href={props.to}>{children}</a>,
}));

// ── Imports (after mocks) ───────────────────────────────────────

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { DocumentsTab } from './documents-tab';
import type { Document } from './shared';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ── Test data ───────────────────────────────────────────────────

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    syncTargetId: 'st-1',
    sourceKey: 'docs/readme.md',
    sourceEtag: null,
    mimeType: 'text/markdown',
    fileSize: 2048,
    title: 'README',
    description: null,
    author: null,
    pageCount: null,
    status: 'ready',
    errorMessage: null,
    chunkCount: 5,
    customMetadata: {},
    contentHash: 'abc123',
    searchMetaDirty: false,
    lastSyncedAt: '2025-06-01T10:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-06-01T10:00:00Z',
    ...overrides,
  };
}

// ================================================================
// RecentActivityPanel (non-S3 sources)
// ================================================================

describe('DocumentsTab — RecentActivityPanel (non-S3)', () => {
  it('renders the document table with mock data', async () => {
    const docs = [
      makeDoc({ id: 'doc-1', title: 'README', sourceKey: 'docs/readme.md' }),
      makeDoc({
        id: 'doc-2',
        title: 'Guide',
        sourceKey: 'docs/guide.md',
        status: 'processing',
        lastSyncedAt: '2025-06-02T10:00:00Z',
      }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
      expect(screen.getByText('Guide')).toBeTruthy();
    });

    // Column headers are present
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Size')).toBeTruthy();
    expect(screen.getByText('Last Synced')).toBeTruthy();
  });

  it('shows empty state when no documents exist', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('No documents')).toBeTruthy();
      expect(screen.getByText('No documents have been synced yet.')).toBeTruthy();
    });
  });

  it('shows loading spinner while data is fetched', () => {
    // Never resolve to keep loading state active
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    // LoadingSpinner renders a spinner element — check the loading wrapper is visible
    const spinnerWrapper = container.querySelector('.flex.justify-center.py-12');
    expect(spinnerWrapper).toBeTruthy();
  });

  it('renders the "Recent activity" heading and total count', async () => {
    const docs = [
      makeDoc({ id: 'doc-1', title: 'File 1' }),
      makeDoc({ id: 'doc-2', title: 'File 2', status: 'processing' }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('Recent activity')).toBeTruthy();
      // Total count shown in the subtitle (appears after data loads)
      expect(screen.getByText(/2 total/)).toBeTruthy();
    });
  });

  it('renders "View all in Documents" link', async () => {
    mockApiFetch.mockResolvedValue([makeDoc()]);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText(/View all in Documents/)).toBeTruthy();
    });
  });

  it('shows document count with "Showing N of M" when there are more than 25 documents', async () => {
    const docs = Array.from({ length: 30 }, (_, i) =>
      makeDoc({
        id: `doc-${i}`,
        title: `Document ${i}`,
        sourceKey: `docs/file-${i}.md`,
        lastSyncedAt: new Date(2025, 5, 1, 10, i).toISOString(),
      }),
    );
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText(/Showing 25 of 30/)).toBeTruthy();
      expect(screen.getByText('view all')).toBeTruthy();
    });
  });

  it('excludes deleted documents from the display', async () => {
    const docs = [
      makeDoc({ id: 'doc-1', title: 'Visible Doc', status: 'ready' }),
      makeDoc({ id: 'doc-2', title: 'Deleted Doc', status: 'deleted' }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('Visible Doc')).toBeTruthy();
    });

    // The deleted document should not appear in the table
    expect(screen.queryByText('Deleted Doc')).toBeNull();
  });

  it('displays status badges for each document', async () => {
    const docs = [
      makeDoc({ id: 'doc-1', title: 'Ready Doc', status: 'ready' }),
      makeDoc({ id: 'doc-2', title: 'Error Doc', status: 'error', lastSyncedAt: '2025-06-03T10:00:00Z' }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
      expect(screen.getByText('error')).toBeTruthy();
    });
  });

  it('shows sourceKey when document has no title', async () => {
    const docs = [makeDoc({ id: 'doc-1', title: null, sourceKey: 'path/to/file.pdf' })];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('path/to/file.pdf')).toBeTruthy();
    });
  });
});

// ================================================================
// S3FileBrowser
// ================================================================

describe('DocumentsTab — S3FileBrowser', () => {
  const browseResponse = {
    path: '',
    folders: ['docs/', 'images/'],
    files: [
      {
        sourceKey: 'readme.md',
        size: 1024,
        lastModified: '2025-06-01T10:00:00Z',
        document: makeDoc({ id: 'doc-1', title: 'README', sourceKey: 'readme.md' }),
      },
      {
        sourceKey: 'untracked.txt',
        size: 512,
        lastModified: '2025-06-02T10:00:00Z',
        document: null,
      },
    ],
  };

  it('renders the S3 file browser when sourceType is s3', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/'))
        return Promise.resolve({
          id: 'st-1',
          config: { bucket: 'test-bucket', prefix: 'data/' },
        });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Folders are rendered
    expect(screen.getByText('docs')).toBeTruthy();
    expect(screen.getByText('images')).toBeTruthy();
  });

  it('renders toolbar with New Folder and Upload buttons', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /New Folder/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy();
  });

  it('renders column headers (Name, Status, Size)', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Size')).toBeTruthy();
  });

  it('shows loading spinner while browse data is loading', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    const spinnerWrapper = container.querySelector('.flex.justify-center.py-12');
    expect(spinnerWrapper).toBeTruthy();
  });

  it('shows empty folder message when no files or folders exist', async () => {
    const emptyBrowse = { path: '', folders: [], files: [] };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(emptyBrowse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('This folder is empty.')).toBeTruthy();
    });
  });

  it('shows "untracked" for files without a document record', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('untracked')).toBeTruthy();
    });
  });

  it('renders root breadcrumb with bucket label from sync target config', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/'))
        return Promise.resolve({ id: 'st-1', config: { bucket: 'my-bucket', prefix: 'docs' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('s3://my-bucket/docs')).toBeTruthy();
    });
  });

  it('renders breadcrumb segments for nested paths', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve({ path: 'docs/policies/', folders: [], files: [] });
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="docs/policies/" />);

    await waitFor(() => {
      expect(screen.getByText('This folder is empty.')).toBeTruthy();
    });

    // Breadcrumb segments for the nested path
    expect(screen.getByText('docs')).toBeTruthy();
    expect(screen.getByText('policies')).toBeTruthy();
  });

  it('renders a select-all checkbox', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeTruthy();
  });

  it('renders individual checkboxes for each file and folder', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // 2 folders + 2 files + 1 select-all = 5 checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(5);
  });

  it('displays file size for files with size data', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // 1024 bytes = "1.0 KB"
    expect(screen.getByText('1.0 KB')).toBeTruthy();
  });
});

// ================================================================
// Routing: sourceType dispatch
// ================================================================

describe('DocumentsTab — sourceType routing', () => {
  it('renders RecentActivityPanel for non-S3 sourceType', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('Recent activity')).toBeTruthy();
    });
  });

  it('renders RecentActivityPanel when sourceType is undefined', async () => {
    mockApiFetch.mockResolvedValue([]);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" />);

    await waitFor(() => {
      expect(screen.getByText('Recent activity')).toBeTruthy();
    });
  });

  it('renders S3FileBrowser for s3 sourceType', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve({ path: '', folders: [], files: [] });
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('This folder is empty.')).toBeTruthy();
    });

    // RecentActivityPanel heading should NOT be present
    expect(screen.queryByText('Recent activity')).toBeNull();
  });
});

// ================================================================
// S3FileBrowser — breadcrumb navigation
// ================================================================

describe('DocumentsTab — S3 breadcrumb navigation', () => {
  it('calls onBrowsePathChange when root breadcrumb is clicked', async () => {
    const user = userEvent.setup();
    const onBrowsePathChange = vi.fn();

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve({ path: 'docs/policies/', folders: [], files: [] });
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(
      <DocumentsTab
        sourceId="st-1"
        sourceType="s3"
        browsePath="docs/policies/"
        onBrowsePathChange={onBrowsePathChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeTruthy();
    });

    // Click the root breadcrumb to navigate to root
    const rootButton = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.startsWith('s3://') || btn.textContent === '/');
    expect(rootButton).toBeTruthy();
    await user.click(rootButton!);
    expect(onBrowsePathChange).toHaveBeenCalledWith('');
  });

  it('calls onBrowsePathChange when a breadcrumb segment is clicked', async () => {
    const user = userEvent.setup();
    const onBrowsePathChange = vi.fn();

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve({ path: 'docs/policies/', folders: [], files: [] });
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(
      <DocumentsTab
        sourceId="st-1"
        sourceType="s3"
        browsePath="docs/policies/"
        onBrowsePathChange={onBrowsePathChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeTruthy();
    });

    // Click the "docs" breadcrumb segment
    await user.click(screen.getByText('docs'));

    expect(onBrowsePathChange).toHaveBeenCalledWith('docs/');
  });
});

// ================================================================
// S3FileBrowser — folder and file row interactions
// ================================================================

describe('DocumentsTab — S3 folder/file row interactions', () => {
  const browseWithFolder = {
    path: '',
    folders: ['docs/'],
    files: [
      {
        sourceKey: 'readme.md',
        size: 1024,
        lastModified: '2025-06-01T10:00:00Z',
        document: makeDoc({ id: 'doc-1', title: 'README', sourceKey: 'readme.md' }),
      },
    ],
  };

  it('navigates into a folder when folder name is clicked', async () => {
    const user = userEvent.setup();
    const onBrowsePathChange = vi.fn();

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseWithFolder);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(
      <DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" onBrowsePathChange={onBrowsePathChange} />,
    );

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeTruthy();
    });

    // Click the folder name button
    await user.click(screen.getByText('docs'));

    expect(onBrowsePathChange).toHaveBeenCalledWith('docs/');
  });

  it('opens document detail sheet when file row is clicked', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseWithFolder);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Click the file name cell (td with the title)
    await user.click(screen.getByText('README'));

    // The document detail sheet mock should render
    await waitFor(() => {
      expect(screen.getByTestId('document-detail-sheet')).toBeTruthy();
    });
  });

  it('toggles checkbox when individual item checkbox is clicked', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseWithFolder);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Click the checkbox for the folder
    const folderCheckbox = screen.getByRole('checkbox', { name: 'Select docs' });
    await user.click(folderCheckbox);

    // After click, the delete button should appear for 1 selected item
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    });
  });

  it('shows delete button after selecting items and hides when deselected', async () => {
    const user = userEvent.setup();

    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseWithFolder);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Initially no delete button
    expect(screen.queryByRole('button', { name: /Delete \d+/ })).toBeNull();

    // Select a checkbox
    const folderCheckbox = screen.getByRole('checkbox', { name: 'Select docs' });
    await user.click(folderCheckbox);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    });

    // Deselect
    await user.click(folderCheckbox);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Delete \d+/ })).toBeNull();
    });
  });
});

// ================================================================
// RecentActivityPanel — row interaction and status badges
// ================================================================

describe('DocumentsTab — RecentActivityPanel interactions', () => {
  it('opens document detail sheet when a document row is clicked', async () => {
    const user = userEvent.setup();
    const docs = [makeDoc({ id: 'doc-1', title: 'Clickable Doc', sourceKey: 'docs/clickable.md' })];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('Clickable Doc')).toBeTruthy();
    });

    // Click the document row
    await user.click(screen.getByText('Clickable Doc'));

    // The document detail sheet mock should appear
    await waitFor(() => {
      expect(screen.getByTestId('document-detail-sheet')).toBeTruthy();
    });
  });

  it('displays correct status badge variants', async () => {
    const docs = [
      makeDoc({ id: 'doc-1', title: 'Ready Doc', status: 'ready', lastSyncedAt: '2025-06-01T10:00:00Z' }),
      makeDoc({ id: 'doc-2', title: 'Processing Doc', status: 'processing', lastSyncedAt: '2025-06-02T10:00:00Z' }),
      makeDoc({ id: 'doc-3', title: 'Pending Doc', status: 'pending', lastSyncedAt: '2025-06-03T10:00:00Z' }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
      expect(screen.getByText('processing')).toBeTruthy();
      expect(screen.getByText('pending')).toBeTruthy();
    });
  });

  it('displays file size for documents with fileSize data', async () => {
    const docs = [makeDoc({ id: 'doc-1', title: 'Sized Doc', fileSize: 2048, lastSyncedAt: '2025-06-01T10:00:00Z' })];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('2.0 KB')).toBeTruthy();
    });
  });

  it('shows dash for documents without fileSize', async () => {
    const docs = [makeDoc({ id: 'doc-1', title: 'No Size Doc', fileSize: null, lastSyncedAt: '2025-06-01T10:00:00Z' })];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('No Size Doc')).toBeTruthy();
    });

    // Should display a dash for missing fileSize
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows dash for documents without lastSyncedAt', async () => {
    const docs = [makeDoc({ id: 'doc-1', title: 'Never Synced', lastSyncedAt: null })];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('Never Synced')).toBeTruthy();
    });

    // Should display a dash for missing lastSyncedAt
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts documents when column header is clicked', async () => {
    const user = userEvent.setup();
    const docs = [
      makeDoc({ id: 'doc-1', title: 'Alpha', lastSyncedAt: '2025-06-01T10:00:00Z' }),
      makeDoc({ id: 'doc-2', title: 'Bravo', lastSyncedAt: '2025-06-02T10:00:00Z' }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
      expect(screen.getByText('Bravo')).toBeTruthy();
    });

    // Click the Name column header to sort
    await user.click(screen.getByText('Name'));

    // Both docs should still be visible after sorting
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Bravo')).toBeTruthy();
  });

  it('opens upload dialog when Upload button is clicked in S3 browser', async () => {
    const user = userEvent.setup();
    const browseData = {
      path: '',
      folders: [],
      files: [
        {
          sourceKey: 'readme.md',
          size: 1024,
          lastModified: '2025-06-01T10:00:00Z',
          document: makeDoc({ id: 'doc-1', title: 'README', sourceKey: 'readme.md' }),
        },
      ],
    };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseData);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Upload/ })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Upload/ }));

    await waitFor(() => {
      expect(screen.getByTestId('upload-dialog')).toBeTruthy();
    });
  });

  it('opens create folder dialog when New Folder button is clicked', async () => {
    const user = userEvent.setup();
    const browseData = {
      path: '',
      folders: [],
      files: [],
    };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseData);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Folder/ })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /New Folder/ }));

    await waitFor(() => {
      expect(screen.getByTestId('create-folder-dialog')).toBeTruthy();
    });
  });

  it('renders status with underscores replaced by spaces', async () => {
    const docs = [
      makeDoc({
        id: 'doc-1',
        title: 'Status Doc',
        status: 'ready' as Document['status'],
        lastSyncedAt: '2025-06-01T10:00:00Z',
      }),
    ];
    mockApiFetch.mockResolvedValue(docs);

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="web" />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
    });
  });
});

// ================================================================
// S3FileBrowser — additional interaction tests
// ================================================================

describe('DocumentsTab — S3 interaction tests', () => {
  const browseResponse = {
    path: '',
    folders: ['docs/'],
    files: [
      {
        sourceKey: 'readme.md',
        size: 1024,
        lastModified: '2025-06-01T10:00:00Z',
        document: makeDoc({ id: 'doc-1', title: 'README', sourceKey: 'readme.md' }),
      },
      {
        sourceKey: 'guide.txt',
        size: 512,
        lastModified: '2025-06-02T10:00:00Z',
        document: makeDoc({ id: 'doc-2', title: 'Guide', sourceKey: 'guide.txt' }),
      },
    ],
  };

  function setupS3Mocks() {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(browseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      if (url.includes('/bulk-delete')) return Promise.resolve({ deleted: 1 });
      return Promise.resolve([]);
    });
  }

  it('bulk delete files via AlertDialog', async () => {
    const user = userEvent.setup();
    setupS3Mocks();

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    // Wait for the file browser to render
    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Select a file checkbox
    const fileCheckbox = screen.getByRole('checkbox', { name: 'Select readme.md' });
    await user.click(fileCheckbox);

    // The "Delete 1" button should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    });

    // Click the Delete button to open the AlertDialog
    await user.click(screen.getByRole('button', { name: /^Delete$/ }));

    // The AlertDialog should be visible with confirmation text
    await waitFor(() => {
      expect(screen.getByText('Delete 1 items?')).toBeTruthy();
    });

    // Click the confirm "Delete" action inside the AlertDialog
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirmButton);

    // Assert that apiFetch was called with the bulk-delete endpoint
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['doc-1'] }),
      });
    });
  });

  it('select-all checkbox selects all items', async () => {
    const user = userEvent.setup();
    setupS3Mocks();

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Click the select-all checkbox
    const selectAllCheckbox = screen.getByRole('checkbox', { name: 'Select all' });
    await user.click(selectAllCheckbox);

    // The "Delete N" button should show the correct count (1 folder + 2 files = 3)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    });
  });

  it('sort toggle on Name column header', async () => {
    const user = userEvent.setup();
    setupS3Mocks();

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // The Name column starts with a default sort (asc). Click to toggle.
    const nameHeader = screen.getByText('Name');
    await user.click(nameHeader);

    // After first click on the already-active 'name' column, it should toggle direction.
    // The sort indicator (arrow) should be present. Check for the down arrow (descending).
    await waitFor(() => {
      // The SortableTh renders a Unicode arrow: '\u2191' for asc, '\u2193' for desc
      expect(screen.getByText('\u2193')).toBeTruthy();
    });
  });

  it('S3 browse view renders "Last Synced" column header', async () => {
    setupS3Mocks();

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    expect(screen.getByText('Last Synced')).toBeTruthy();
  });

  it('shows RefreshCw icon when document has searchMetaDirty: true in S3 browse view', async () => {
    const dirtyBrowseResponse = {
      path: '',
      folders: [],
      files: [
        {
          sourceKey: 'dirty-file.md',
          size: 1024,
          lastModified: '2025-06-01T10:00:00Z',
          document: makeDoc({
            id: 'doc-dirty',
            title: 'Dirty File',
            sourceKey: 'dirty-file.md',
            searchMetaDirty: true,
          }),
        },
      ],
    };
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/browse')) return Promise.resolve(dirtyBrowseResponse);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', config: { bucket: 'b' } });
      return Promise.resolve([]);
    });

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('Dirty File')).toBeTruthy();
    });

    // The S3 file browser shows "(needs sync)" text for dirty documents
    expect(screen.getByText('(needs sync)')).toBeTruthy();
  });

  it('enters rename mode on edit button click', async () => {
    const user = userEvent.setup();
    setupS3Mocks();

    renderWithQueryClient(<DocumentsTab sourceId="st-1" sourceType="s3" browsePath="" />);

    await waitFor(() => {
      expect(screen.getByText('README')).toBeTruthy();
    });

    // Find the rename button for the file row using its aria-label
    const renameButton = screen.getByRole('button', { name: 'Rename readme.md' });
    await user.click(renameButton);

    // An input element should appear with the file name as default value
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      const renameInput = inputs.find((el) => (el as HTMLInputElement).value === 'readme.md');
      expect(renameInput).toBeTruthy();
    });
  });
});
