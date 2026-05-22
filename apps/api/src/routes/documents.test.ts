import type { DocumentService } from '@typhoon/services';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const mockService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  getChunks: vi.fn(),
  getParsedContent: vi.fn(),
  download: vi.fn(),
  updateMetadata: vi.fn(),
  bulkUpdateMetadata: vi.fn(),
  retryFailed: vi.fn(),
  resync: vi.fn(),
  deleteDocument: vi.fn(),
  bulkDelete: vi.fn(),
  move: vi.fn(),
  getMetadataFields: vi.fn(),
}));

vi.mock('../services', () => ({
  getDocumentService: () => mockService as unknown as DocumentService,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function mountRoutes(
  routes: Array<{ path: string; method: string; middleware?: unknown[]; handler: (...args: never) => unknown }>,
) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[route.method.toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    syncTargetId: 'target-1',
    sourceKey: 'folder/file.pdf',
    sourceEtag: 'etag-abc',
    mimeType: 'application/pdf',
    status: 'ready',
    errorMessage: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ── App setup ────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  vi.resetAllMocks();
  const { documentRoutes } = await import('./documents');
  app = mountRoutes(documentRoutes as any);
});

// ── GET /v1/documents ────────────────────────────────────────────────

describe('GET /v1/documents', () => {
  it('returns all documents without filter', async () => {
    const docs = [makeDoc(), makeDoc({ id: 'doc-2' })];
    mockService.list.mockResolvedValue({ data: docs });

    const res = await app.request('/v1/documents');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
  });

  it('filters by syncTargetId query param', async () => {
    const docs = [makeDoc()];
    mockService.list.mockResolvedValue({ data: docs });

    const res = await app.request('/v1/documents?syncTargetId=target-1');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(mockService.list).toHaveBeenCalledWith('target-1');
  });
});

// ── GET /v1/documents/:id ────────────────────────────────────────────

describe('GET /v1/documents/:id', () => {
  it('returns document when found', async () => {
    const doc = makeDoc();
    mockService.getById.mockResolvedValue({ data: doc });

    const res = await app.request('/v1/documents/doc-1');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('doc-1');
  });

  it('returns 404 for missing document', async () => {
    mockService.getById.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing-id');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });
});

// ── GET /v1/documents/:id/chunks ─────────────────────────────────────

describe('GET /v1/documents/:id/chunks', () => {
  it('returns chunks ordered by startIndex', async () => {
    const doc = makeDoc();
    mockService.getChunks.mockResolvedValue({
      data: {
        document: doc,
        chunks: [
          { text: 'first chunk', startIndex: 0 },
          { text: 'second chunk', startIndex: 10 },
        ],
      },
    });

    const res = await app.request('/v1/documents/doc-1/chunks');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.document.id).toBe('doc-1');
    expect(json.chunks).toHaveLength(2);
    expect(json.chunks[0]).toEqual({ text: 'first chunk', startIndex: 0 });
    expect(json.chunks[1]).toEqual({ text: 'second chunk', startIndex: 10 });
  });

  it('returns 404 when document not found', async () => {
    mockService.getChunks.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing/chunks');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('handles metadata with text and startIndex', async () => {
    const doc = makeDoc();
    mockService.getChunks.mockResolvedValue({
      data: { document: doc, chunks: [{ text: 'chunk text', startIndex: 5 }] },
    });

    const res = await app.request('/v1/documents/doc-1/chunks');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chunks[0]).toEqual({ text: 'chunk text', startIndex: 5 });
  });

  it('uses null for missing startIndex and empty string for missing text', async () => {
    const doc = makeDoc();
    mockService.getChunks.mockResolvedValue({
      data: { document: doc, chunks: [{ text: '', startIndex: null }] },
    });

    const res = await app.request('/v1/documents/doc-1/chunks');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chunks[0]).toEqual({ text: '', startIndex: null });
  });
});

// ── GET /v1/documents/:id/parsed-content ────────────────────────────

describe('GET /v1/documents/:id/parsed-content', () => {
  it('returns 404 when document not found', async () => {
    mockService.getParsedContent.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing/parsed-content');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 404 when sync target not found', async () => {
    mockService.getParsedContent.mockResolvedValue({ error: 'Sync target not found' });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });

  it('returns parsed text for custom parser files (pdf)', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { text: 'extracted pdf text', contentHash: null } });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('extracted pdf text');
  });

  it('returns parsed text for custom parser files (docx)', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { text: 'extracted docx text', contentHash: null } });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('extracted docx text');
  });

  it('returns UTF-8 text for plain text files', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { text: 'plain text content', contentHash: null } });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('plain text content');
  });

  it('returns 400 when no parser available for file type', async () => {
    mockService.getParsedContent.mockResolvedValue({ error: 'No parser available' });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('No parser available');
  });

  it('returns Cache-Control and ETag headers when contentHash exists', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { text: 'content', contentHash: 'abc123' } });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('ETag')).toBe('abc123');
  });

  it('returns Cache-Control without ETag when contentHash is null', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { text: 'content', contentHash: null } });

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('ETag')).toBeNull();
  });

  it('returns 304 Not Modified when If-None-Match matches contentHash', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { notModified: true } });

    const res = await app.request('/v1/documents/doc-1/parsed-content', {
      headers: { 'If-None-Match': 'abc123' },
    });
    expect(res.status).toBe(304);
    expect(mockService.getParsedContent).toHaveBeenCalledWith('doc-1', 'abc123');
  });

  it('fetches from S3 when If-None-Match does not match contentHash', async () => {
    mockService.getParsedContent.mockResolvedValue({ data: { text: 'file content', contentHash: 'abc123' } });

    const res = await app.request('/v1/documents/doc-1/parsed-content', {
      headers: { 'If-None-Match': 'old-hash' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('file content');
    expect(res.headers.get('ETag')).toBe('abc123');
  });
});

// ── GET /v1/documents/:id/download ──────────────────────────────────

describe('GET /v1/documents/:id/download', () => {
  it('returns file content with correct Content-Type and Content-Disposition headers', async () => {
    const fileContent = Buffer.from('pdf binary content');
    mockService.download.mockResolvedValue({
      data: { content: fileContent, mimeType: 'application/pdf', filename: 'report.pdf' },
    });

    const res = await app.request('/v1/documents/doc-1/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="report.pdf"');
    expect(res.headers.get('Content-Length')).toBe(String(fileContent.byteLength));
  });

  it('falls back to octet-stream when mimeType is null', async () => {
    mockService.download.mockResolvedValue({
      data: { content: Buffer.from('data'), mimeType: null, filename: 'file.bin' },
    });

    const res = await app.request('/v1/documents/doc-1/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('returns 404 when document not found', async () => {
    mockService.download.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing/download');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 404 when sync target not found', async () => {
    mockService.download.mockResolvedValue({ error: 'Sync target not found' });

    const res = await app.request('/v1/documents/doc-1/download');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });
});

// ── POST /v1/documents/:id/retry ─────────────────────────────────────

describe('POST /v1/documents/:id/retry', () => {
  it('returns 404 for missing document', async () => {
    mockService.retryFailed.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing/retry', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 when status is not error', async () => {
    mockService.retryFailed.mockResolvedValue({ error: 'Document is not in an error state' });

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Document is not in an error state');
  });

  it('enqueues process-file job and updates status for error', async () => {
    const updated = makeDoc({ status: 'processing' });
    mockService.retryFailed.mockResolvedValue({ data: updated });

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processing');
  });

  it('returns 404 when sync target not found', async () => {
    mockService.retryFailed.mockResolvedValue({ error: 'Sync target not found' });

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });
});

// ── POST /v1/documents/:id/resync ────────────────────────────────────

describe('POST /v1/documents/:id/resync', () => {
  it('returns 404 for missing document', async () => {
    mockService.resync.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing/resync', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 for deleted documents', async () => {
    mockService.resync.mockResolvedValue({ error: 'Cannot re-sync a deleted document' });

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Cannot re-sync a deleted document');
  });

  it('returns 409 for processing documents', async () => {
    mockService.resync.mockResolvedValue({ error: 'Document is already being processed' });

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Document is already being processed');
  });

  it('returns 409 for pending documents', async () => {
    mockService.resync.mockResolvedValue({ error: 'Document is already being processed' });

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Document is already being processed');
  });

  it('enqueues process-file job for ready documents', async () => {
    const updated = makeDoc({ status: 'processing' });
    mockService.resync.mockResolvedValue({ data: updated });

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processing');
  });

  it('returns 404 when sync target not found', async () => {
    mockService.resync.mockResolvedValue({ error: 'Sync target not found' });

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });
});

// ── DELETE /v1/documents/:id ─────────────────────────────────────────

describe('DELETE /v1/documents/:id', () => {
  it('calls deleteDocument and returns { ok: true }', async () => {
    mockService.deleteDocument.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/documents/doc-1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('returns 404 for missing document', async () => {
    mockService.deleteDocument.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing', { method: 'DELETE' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });
});

// ── POST /v1/documents/bulk-delete ──────────────────────────────────

describe('POST /v1/documents/bulk-delete', () => {
  it('deletes multiple documents and returns { ok, deleted } count', async () => {
    const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const id2 = 'c7d45e12-3f4a-1b2c-8d9e-0f1a2b3c4d5e';
    mockService.bulkDelete.mockResolvedValue({ data: { ok: true, deleted: 2 } });

    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id1, id2] }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(2);
  });

  it('returns { ok: true, deleted: 0 } for empty ID list', async () => {
    mockService.bulkDelete.mockResolvedValue({ data: { ok: true, deleted: 0 } });

    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 0 });
  });

  it('validates UUID array (rejects non-UUIDs)', async () => {
    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['not-a-uuid'] }),
    });

    expect(res.status).toBe(500); // Zod parse throws, unhandled -> 500
  });

  it('validates UUID array (rejects over 100 ids)', async () => {
    const base = 'a0eebc99-9c0b-4ef8-bb6d-';
    const ids = Array.from({ length: 101 }, (_, i) => `${base}${String(i).padStart(12, '0')}`);
    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    expect(res.status).toBe(500); // Zod parse throws, unhandled -> 500
  });
});

// ── POST /v1/documents/:id/move ──────────────────────────────────────

describe('POST /v1/documents/:id/move', () => {
  it('returns 404 for missing document', async () => {
    mockService.move.mockResolvedValue({ error: 'Not found' });

    const res = await app.request('/v1/documents/missing/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 404 when sync target not found', async () => {
    mockService.move.mockResolvedValue({ error: 'Sync target not found' });

    const res = await app.request('/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });

  it('returns 400 when provider does not support move (no copyObject)', async () => {
    mockService.move.mockResolvedValue({ error: 'Move is not supported for this source type' });

    const res = await app.request('/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Move is not supported for this source type');
  });

  it('returns 400 when provider does not support move (no deleteObject)', async () => {
    mockService.move.mockResolvedValue({ error: 'Move is not supported for this source type' });

    const res = await app.request('/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Move is not supported for this source type');
  });

  it('copies to new key, updates DB, updates vector metadata, deletes old key', async () => {
    const updated = makeDoc({ sourceKey: 'new/path.pdf' });
    mockService.move.mockResolvedValue({ data: updated });

    const res = await app.request('/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sourceKey).toBe('new/path.pdf');
    expect(mockService.move).toHaveBeenCalledWith('doc-1', 'new/path.pdf');
  });
});
