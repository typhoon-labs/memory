import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => <a href={props.to}>{children}</a>,
}));

// ── Imports (after mocks) ───────────────────────────────────────

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { DocumentDetailSheet } from './document-detail-sheet';
import type { Document } from './shared';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ── Test data ───────────────────────────────────────────────────

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    syncTargetId: 'st-1',
    sourceKey: 'docs/readme.md',
    sourceEtag: 'etag-abc',
    mimeType: 'text/markdown',
    fileSize: 4096,
    title: 'README Document',
    description: 'A helpful readme file.',
    author: 'Jane Doe',
    pageCount: 3,
    status: 'ready',
    errorMessage: null,
    chunkCount: 12,
    customMetadata: {},
    contentHash: 'sha256-abc123',
    searchMetaDirty: false,
    lastSyncedAt: '2025-06-01T10:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-06-01T10:00:00Z',
    ...overrides,
  };
}

// ================================================================
// Rendering & visibility
// ================================================================

describe('DocumentDetailSheet — rendering', () => {
  it('renders nothing when document is null', () => {
    const { container } = renderWithQueryClient(
      <DocumentDetailSheet document={null} open={false} onOpenChange={vi.fn()} />,
    );

    // The Sheet should not render anything meaningful
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when document is null even if open is true', () => {
    const { container } = renderWithQueryClient(
      <DocumentDetailSheet document={null} open={true} onOpenChange={vi.fn()} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders document title in the sheet header when open', async () => {
    const doc = makeDoc({ title: 'My Document Title' });
    // The component fetches fresh document data; mock it
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('My Document Title')).toBeTruthy();
    });
  });

  it('renders sourceKey as title when document has no title', async () => {
    const doc = makeDoc({ title: null, sourceKey: 'path/to/file.pdf' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    // sourceKey appears in both the header title and the details section
    await waitFor(() => {
      const matches = screen.getAllByText('path/to/file.pdf');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders status badge in the header', async () => {
    const doc = makeDoc({ status: 'ready' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
    });
  });

  it('renders all three tab triggers', async () => {
    const doc = makeDoc();
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Details' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Content' })).toBeTruthy();
    });
  });
});

// ================================================================
// Details tab
// ================================================================

describe('DocumentDetailSheet — Details tab', () => {
  it('shows the File Properties section with key document fields', async () => {
    const doc = makeDoc({
      sourceKey: 'docs/guide.md',
      mimeType: 'text/markdown',
      fileSize: 4096,
      chunkCount: 12,
    });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    expect(screen.getByText('Source Key')).toBeTruthy();
    expect(screen.getByText('docs/guide.md')).toBeTruthy();
    expect(screen.getByText('MIME Type')).toBeTruthy();
    expect(screen.getByText('text/markdown')).toBeTruthy();
    expect(screen.getByText('File Size')).toBeTruthy();
    expect(screen.getByText('4.0 KB')).toBeTruthy();
    expect(screen.getByText('Chunks')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('shows author and page count when present', async () => {
    const doc = makeDoc({ author: 'Jane Doe', pageCount: 3 });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Author')).toBeTruthy();
      expect(screen.getByText('Jane Doe')).toBeTruthy();
      expect(screen.getByText('Pages')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
    });
  });

  it('shows content hash when present', async () => {
    const doc = makeDoc({ contentHash: 'sha256-abc123' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Content Hash')).toBeTruthy();
      expect(screen.getByText('sha256-abc123')).toBeTruthy();
    });
  });

  it('shows document description when present', async () => {
    const doc = makeDoc({ description: 'A helpful readme file.' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('A helpful readme file.')).toBeTruthy();
    });
  });

  it('shows Timestamps section with Created and Updated', async () => {
    const doc = makeDoc({
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-06-01T10:00:00Z',
      lastSyncedAt: '2025-06-01T10:00:00Z',
    });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Timestamps')).toBeTruthy();
      expect(screen.getByText('Created')).toBeTruthy();
      expect(screen.getByText('Updated')).toBeTruthy();
      expect(screen.getByText('Last Synced')).toBeTruthy();
    });
  });

  it('shows Re-sync button for ready documents', async () => {
    const doc = makeDoc({ status: 'ready' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-sync/ })).toBeTruthy();
    });
  });

  it('shows Delete button', async () => {
    const doc = makeDoc();
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete/ })).toBeTruthy();
    });
  });

  it('shows Retry button and error details for errored documents', async () => {
    const doc = makeDoc({
      status: 'error',
      errorMessage: 'Failed to parse document: unsupported format',
    });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Error Details')).toBeTruthy();
      expect(screen.getByText('Failed to parse document: unsupported format')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
    });
  });

  it('does not show Retry button for non-error documents', async () => {
    const doc = makeDoc({ status: 'ready' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('does not show Re-sync button for non-ready documents', async () => {
    const doc = makeDoc({ status: 'processing' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /Re-sync/ })).toBeNull();
  });

  it('shows dash for missing mimeType and fileSize', async () => {
    const doc = makeDoc({ mimeType: null, fileSize: null });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('MIME Type')).toBeTruthy();
    });

    // Two dashes for null mimeType and null fileSize
    const dashes = screen.getAllByText('\u2014');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});

// ================================================================
// Metadata tab
// ================================================================

describe('DocumentDetailSheet — Metadata tab', () => {
  it('shows "No metadata template assigned" when sync target has no template', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ syncTargetId: 'st-1' });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByText('No metadata template assigned to this sync source.')).toBeTruthy();
    });
  });

  it('renders Title and Description editing sections', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ title: 'Unique Title For Meta', description: 'Unique Description For Meta' });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      // Section labels
      expect(screen.getByText('Title')).toBeTruthy();
      expect(screen.getByText('Description')).toBeTruthy();
      // The values appear in the click-to-edit buttons within the metadata tab.
      // The title also appears in the sheet header, so use getAllByText.
      expect(screen.getAllByText('Unique Title For Meta').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Unique Description For Meta')).toBeTruthy();
    });
  });

  it('renders Save Changes button on metadata tab', async () => {
    const user = userEvent.setup();
    const doc = makeDoc();
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Changes/ })).toBeTruthy();
    });
  });

  it('renders template metadata fields when a template is assigned', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { region: 'US', priority: '5' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            region: { type: 'string', required: true, description: 'Geographic region' },
            priority: { type: 'number', description: 'Document priority' },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    // Field names and values should be visible. Field names may appear in both
    // the label and description, so use getAllByText for field names.
    await waitFor(() => {
      expect(screen.getAllByText(/region/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/priority/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('US')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
    });
  });

  it('shows "No title" and "No description" when both are empty', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ title: null, description: null });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByText('No title')).toBeTruthy();
      expect(screen.getByText('No description')).toBeTruthy();
    });
  });
});

// ================================================================
// Action button mutations
// ================================================================

describe('DocumentDetailSheet — action button mutations', () => {
  it('calls apiFetch with POST for re-sync when Re-sync button is clicked', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ status: 'ready' });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/resync')) return Promise.resolve({});
      return Promise.resolve(doc);
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Re-sync/ })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Re-sync/ }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/documents/${doc.id}/resync`, { method: 'POST' });
    });
  });

  it('calls apiFetch with DELETE when Delete is confirmed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const doc = makeDoc({ status: 'ready' });
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'DELETE') return Promise.resolve({});
      return Promise.resolve(doc);
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delete/ })).toBeTruthy();
    });

    // Click the Delete button to open the confirmation dialog
    await user.click(screen.getByRole('button', { name: /Delete/ }));

    // The AlertDialog should appear with a confirmation button
    await waitFor(() => {
      expect(screen.getByText('Delete document?')).toBeTruthy();
    });

    // Click the confirmation Delete button inside the dialog
    const confirmBtn = screen
      .getAllByRole('button', { name: /Delete/ })
      .find((btn) => btn.closest('[role="alertdialog"]'));
    expect(confirmBtn).toBeTruthy();
    await user.click(confirmBtn!);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/documents/${doc.id}`, { method: 'DELETE' });
    });
  });

  it('calls apiFetch with POST for retry when Retry button is clicked', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ status: 'error', errorMessage: 'Parse failed' });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/retry')) return Promise.resolve({});
      return Promise.resolve(doc);
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/documents/${doc.id}/retry`, { method: 'POST' });
    });
  });
});

// ================================================================
// Document field display details
// ================================================================

describe('DocumentDetailSheet — detailed field display', () => {
  it('displays error message for errored documents', async () => {
    const doc = makeDoc({ status: 'error', errorMessage: 'Unsupported file format: .xyz' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Error Details')).toBeTruthy();
      expect(screen.getByText('Unsupported file format: .xyz')).toBeTruthy();
    });
  });

  it('does not show error section when document has no error', async () => {
    const doc = makeDoc({ status: 'ready', errorMessage: null });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    expect(screen.queryByText('Error Details')).toBeNull();
  });

  it('displays chunk count in the File Properties section', async () => {
    const doc = makeDoc({ chunkCount: 42 });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Chunks')).toBeTruthy();
      expect(screen.getByText('42')).toBeTruthy();
    });
  });

  it('displays formatted file size', async () => {
    const doc = makeDoc({ fileSize: 1048576 }); // 1 MB
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Size')).toBeTruthy();
      expect(screen.getByText('1.0 MB')).toBeTruthy();
    });
  });

  it('displays MIME type value', async () => {
    const doc = makeDoc({ mimeType: 'application/pdf' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('MIME Type')).toBeTruthy();
      expect(screen.getByText('application/pdf')).toBeTruthy();
    });
  });

  it('displays Last Synced timestamp when present', async () => {
    const doc = makeDoc({ lastSyncedAt: '2025-06-15T14:30:00Z' });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Last Synced')).toBeTruthy();
    });
  });

  it('does not display Last Synced when lastSyncedAt is null', async () => {
    const doc = makeDoc({ lastSyncedAt: null });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Created')).toBeTruthy();
    });

    expect(screen.queryByText('Last Synced')).toBeNull();
  });

  it('displays file size as bytes for small files', async () => {
    const doc = makeDoc({ fileSize: 512 });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('512 B')).toBeTruthy();
    });
  });

  it('displays file size in KB for medium files', async () => {
    const doc = makeDoc({ fileSize: 5120 }); // 5.0 KB
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('5.0 KB')).toBeTruthy();
    });
  });

  it('hides author field when author is null', async () => {
    const doc = makeDoc({ author: null });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    expect(screen.queryByText('Author')).toBeNull();
  });

  it('switches to editing mode when title text is clicked in metadata tab', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ title: 'Editable Title', description: 'Editable Desc' });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByText('Title')).toBeTruthy();
    });

    // Find the title value button and click it to enter edit mode
    const titleButtons = screen.getAllByRole('button');
    const titleEditBtn = titleButtons.find((btn) => btn.textContent === 'Editable Title')!;
    expect(titleEditBtn).toBeTruthy();
    await user.click(titleEditBtn);
    // After click, an input should appear with the title value
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Document title');
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe('Editable Title');
    });
  });

  it('calls apiFetch with PATCH for metadata save', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ title: 'Original Title', description: 'Original Desc' });
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ ...doc, title: 'New Title' });
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Changes/ })).toBeTruthy();
    });

    // Click the title text to enter edit mode
    const titleButtons = screen.getAllByRole('button');
    const titleEditBtn = titleButtons.find((btn) => btn.textContent === 'Original Title')!;
    expect(titleEditBtn).toBeTruthy();
    await user.click(titleEditBtn);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
    });
    const input = screen.getByPlaceholderText('Document title') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'New Title');
    // Blur to exit edit mode
    await user.tab();

    // Click Save Changes
    await user.click(screen.getByRole('button', { name: /Save Changes/ }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/api/v1/documents/${doc.id}`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  it('hides page count field when pageCount is null', async () => {
    const doc = makeDoc({ pageCount: null });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    expect(screen.queryByText('Pages')).toBeNull();
  });
});

// ================================================================
// Interaction tests — click-to-edit & tab switching
// ================================================================

describe('DocumentDetailSheet — interaction tests', () => {
  it('click-to-edit title and save', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ title: 'Old Title' });
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string; body?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ ...doc, title: 'Brand New Title' });
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    // Switch to Metadata tab where title editing lives
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    // Wait for the title click-to-edit button
    await waitFor(() => {
      expect(screen.getByText('Title')).toBeTruthy();
    });

    // Click the title text to enter edit mode
    const titleBtn = screen.getAllByRole('button').find((btn) => btn.textContent === 'Old Title')!;
    expect(titleBtn).toBeTruthy();
    await user.click(titleBtn);

    // Input should appear
    const input = await waitFor(() => screen.getByPlaceholderText('Document title'));
    expect((input as HTMLInputElement).value).toBe('Old Title');

    // Clear and type new title
    await user.clear(input);
    await user.type(input, 'Brand New Title');
    // Blur to exit edit mode
    await user.tab();

    // Click Save Changes
    await user.click(screen.getByRole('button', { name: /Save Changes/ }));

    // Assert PATCH was called with the new title
    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        (call) => call[1] && (call[1] as { method?: string }).method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall![1] as { body: string }).body);
      expect(body.title).toBe('Brand New Title');
    });
  });

  it('click-to-edit description and save', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ description: 'Old Description' });
    mockApiFetch.mockImplementation((url: string, opts?: { method?: string; body?: string }) => {
      if (opts?.method === 'PATCH') return Promise.resolve({ ...doc, description: 'Updated Description' });
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    // Switch to Metadata tab where description editing lives
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    // Wait for the description click-to-edit button
    await waitFor(() => {
      expect(screen.getByText('Description')).toBeTruthy();
    });

    // Click the description text to enter edit mode
    const descBtn = screen.getAllByRole('button').find((btn) => btn.textContent === 'Old Description')!;
    expect(descBtn).toBeTruthy();
    await user.click(descBtn);

    // Textarea should appear
    const textarea = await waitFor(() => screen.getByPlaceholderText('Document description'));
    expect((textarea as HTMLTextAreaElement).value).toBe('Old Description');

    // Clear and type new description
    await user.clear(textarea);
    await user.type(textarea, 'Updated Description');
    // Press Escape to exit edit mode (description uses Escape, not blur for save)
    await user.keyboard('{Escape}');

    // Click Save Changes
    await user.click(screen.getByRole('button', { name: /Save Changes/ }));

    // Assert PATCH was called with the new description
    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        (call) => call[1] && (call[1] as { method?: string }).method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall![1] as { body: string }).body);
      expect(body.description).toBe('Updated Description');
    });
  });

  it('switches to Metadata tab', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({ title: 'Tab Switch Doc', syncTargetId: 'st-1' });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    // Details tab content should be visible by default
    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    // Click the Metadata tab
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    // Metadata tab content should be visible — either template fields or no-template message
    await waitFor(() => {
      expect(screen.getByText('No metadata template assigned to this sync source.')).toBeTruthy();
    });

    // The Title and Description sections should also be visible on the Metadata tab
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeTruthy();
  });

  it('renders template fields with allowedValues as select dropdowns', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { category: 'support' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            category: {
              type: 'string',
              required: true,
              allowedValues: ['support', 'billing', 'general'],
              description: 'Document category',
            },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    // The Select trigger and field name should appear
    await waitFor(() => {
      expect(screen.getByText('category*')).toBeTruthy();
      expect(screen.getByText('Document category')).toBeTruthy();
    });
  });

  it('renders boolean template fields as checkboxes', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { isPublic: 'true' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            isPublic: { type: 'boolean', description: 'Publicly visible' },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByText('isPublic')).toBeTruthy();
      expect(screen.getByText('Publicly visible')).toBeTruthy();
      expect(screen.getByText('Yes')).toBeTruthy();
    });
  });

  it('edits a template text field inline and exits on Enter', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { region: 'US' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            region: { type: 'string', required: true },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    // Wait for the field to render
    await waitFor(() => {
      expect(screen.getByText('US')).toBeTruthy();
    });

    // Click the field value to enter edit mode
    await user.click(screen.getByText('US'));

    // An input should appear with the current value
    const input = await waitFor(() => screen.getByDisplayValue('US'));
    expect(input).toBeTruthy();

    // Type a new value then press Enter
    await user.clear(input);
    await user.type(input, 'UK');
    await user.keyboard('{Enter}');

    // After Enter, the input should disappear and the new value be shown
    await waitFor(() => {
      expect(screen.getByText('UK')).toBeTruthy();
    });
  });

  it('switches to Content tab and shows "No content available" when no chunks', async () => {
    const user = userEvent.setup();
    const doc = makeDoc();
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/chunks')) return Promise.resolve({ document: { id: 'doc-1' }, chunks: [] });
      if (url.includes('/parsed-content')) return Promise.resolve({ text: '' });
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Content' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Content' }));

    await waitFor(() => {
      expect(screen.getByText('No content available.')).toBeTruthy();
    });
  });

  it('switches to Content tab and renders document content from chunks', async () => {
    const user = userEvent.setup();
    const doc = makeDoc();
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/parsed-content')) return Promise.resolve({ text: '' });
      if (url.includes('/chunks'))
        return Promise.resolve({
          document: { id: 'doc-1' },
          chunks: [
            { text: 'First chunk of text.', startIndex: 0 },
            { text: 'Second chunk of text.', startIndex: 100 },
          ],
        });
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: null });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Content' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Content' }));

    // The joined chunk text should appear
    await waitFor(() => {
      expect(screen.getByText(/First chunk of text/)).toBeTruthy();
      expect(screen.getByText(/Second chunk of text/)).toBeTruthy();
    });
  });

  it('shows info icon next to metadata field labels when template has fields', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { region: 'US' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            region: { type: 'string', required: true, description: 'Geographic region' },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getAllByText(/region/).length).toBeGreaterThanOrEqual(1);
    });

    // FieldLabel wraps the field name + FieldBadgePopover with InfoIcon as children.
    // The FieldBadgePopover trigger is a button[type=button] with class 'inline-flex outline-none'.
    const allButtons = screen.getAllByRole('button');
    const popoverTrigger = allButtons.find(
      (btn: HTMLElement) => btn.className.includes('inline-flex') && btn.className.includes('outline-none'),
    );
    expect(popoverTrigger).toBeTruthy();
  });

  it('shows "needs sync" text next to status badge in header when searchMetaDirty is true', async () => {
    const doc = makeDoc({ searchMetaDirty: true });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('needs sync')).toBeTruthy();
    });
  });

  it('does NOT show "needs sync" when searchMetaDirty is false', async () => {
    const doc = makeDoc({ searchMetaDirty: false });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
    });

    expect(screen.queryByText('needs sync')).toBeNull();
  });

  it('select dropdown with non-required field has a clear option rendered as mdash', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { category: 'support' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            category: {
              type: 'string',
              required: false,
              allowedValues: ['support', 'billing'],
            },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getAllByText(/category/).length).toBeGreaterThanOrEqual(1);
    });

    // Open the select dropdown
    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    await user.click(triggers[0]);

    // The mdash clear option should be present (rendered as \u2014)
    await waitFor(() => {
      expect(screen.getByText('\u2014')).toBeTruthy();
    });
  });

  it('X button appears for text fields that have values (to clear them)', async () => {
    const user = userEvent.setup();
    const doc = makeDoc({
      syncTargetId: 'st-1',
      customMetadata: { region: 'US' },
    });
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents/')) return Promise.resolve(doc);
      if (url.includes('/sync-targets/')) return Promise.resolve({ id: 'st-1', metadataTemplateId: 'tmpl-1' });
      if (url.includes('/metadata-templates/'))
        return Promise.resolve({
          id: 'tmpl-1',
          effectiveSchema: {
            region: { type: 'string', required: true },
          },
        });
      return Promise.resolve({});
    });

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Metadata' })).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));

    await waitFor(() => {
      expect(screen.getByText('US')).toBeTruthy();
    });

    // The X clear button is a ghost button that, when clicked, clears the field value.
    // It only appears when !isEditing && value is truthy.
    // When the text "US" is visible as a click-to-edit button, a small clear button
    // should also be present. The value "US" appears as a button; right next to it
    // there should be another button (the clear X). After clicking it, the mdash
    // placeholder should appear instead of "US".
    const valueButton = screen.getByText('US');
    expect(valueButton).toBeTruthy();

    // Find the clear button — it's the sibling button in the same row.
    // The parent row div has 3 columns; the third column contains the clear button.
    // We can find it by looking for buttons that aren't the value button or known other buttons.
    const allButtons = screen.getAllByRole('button');
    // There's a ghost button after the field value that has an SVG child (the X icon).
    // Click it and verify the value is cleared.
    const clearButton = allButtons.find(
      (btn) => btn !== valueButton && btn.querySelector('svg') && btn.closest('[class*="grid-cols"]'),
    );
    expect(clearButton).toBeTruthy();
  });

  it('renders file properties on details tab', async () => {
    const doc = makeDoc({
      sourceKey: 'uploads/report.pdf',
      mimeType: 'application/pdf',
      fileSize: 2097152, // 2.0 MB
      status: 'ready',
      chunkCount: 25,
      author: 'John Smith',
      pageCount: 10,
      contentHash: 'sha256-def456',
    });
    mockApiFetch.mockResolvedValue(doc);

    renderWithQueryClient(<DocumentDetailSheet document={doc} open={true} onOpenChange={vi.fn()} />);

    // Details tab is the default — verify File Properties section
    await waitFor(() => {
      expect(screen.getByText('File Properties')).toBeTruthy();
    });

    // Source Key
    expect(screen.getByText('Source Key')).toBeTruthy();
    expect(screen.getByText('uploads/report.pdf')).toBeTruthy();

    // File Size
    expect(screen.getByText('File Size')).toBeTruthy();
    expect(screen.getByText('2.0 MB')).toBeTruthy();

    // Status badge
    expect(screen.getByText('ready')).toBeTruthy();

    // MIME Type
    expect(screen.getByText('application/pdf')).toBeTruthy();

    // Chunks
    expect(screen.getByText('25')).toBeTruthy();

    // Author
    expect(screen.getByText('Author')).toBeTruthy();
    expect(screen.getByText('John Smith')).toBeTruthy();

    // Pages
    expect(screen.getByText('Pages')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();

    // Content Hash
    expect(screen.getByText('Content Hash')).toBeTruthy();
    expect(screen.getByText('sha256-def456')).toBeTruthy();
  });
});
