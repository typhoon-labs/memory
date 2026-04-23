import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const {
  mockSqlUnsafe,
  mockDbSelect,
  mockDbUpdate,
  mockAdd,
  mockDeleteDocumentVectors,
  mockGetProvider,
  mockGetParser,
  mockNeedsCustomParser,
  mockUpdateDocumentVectorSource,
} = vi.hoisted(() => {
  const mockAdd = vi.fn().mockResolvedValue(undefined);
  const mockSqlUnsafe = vi.fn().mockResolvedValue([]);
  const mockDeleteDocumentVectors = vi.fn().mockResolvedValue(undefined);
  const mockGetProvider = vi.fn();
  const mockGetParser = vi.fn();
  const mockNeedsCustomParser = vi.fn().mockReturnValue(false);
  const mockUpdateDocumentVectorSource = vi.fn().mockResolvedValue(undefined);
  const mockDbSelect = vi.fn();
  const mockDbUpdate = vi.fn();

  return {
    mockSqlUnsafe,
    mockDbSelect,
    mockDbUpdate,
    mockAdd,
    mockDeleteDocumentVectors,
    mockGetProvider,
    mockGetParser,
    mockNeedsCustomParser,
    mockUpdateDocumentVectorSource,
  };
});

vi.mock('../db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  sql: {
    unsafe: mockSqlUnsafe,
  },
}));

vi.mock('@typhoon/db', () => ({
  documents: Symbol('documents'),
  syncTargets: Symbol('syncTargets'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: 'eq' })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals, op: 'inArray' })),
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock('../queue', () => ({
  getSyncQueue: () => ({ add: mockAdd }),
}));

const mockGetChunksByDocumentId = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@typhoon/db/drivers/pg', () => {
  class PgVector {
    getChunksByDocumentId = mockGetChunksByDocumentId;
  }
  return { PgVector };
});

vi.mock('@typhoon/ingestion', () => ({
  deleteDocumentVectors: mockDeleteDocumentVectors,
  getProvider: mockGetProvider,
  getParser: mockGetParser,
  needsCustomParser: mockNeedsCustomParser,
  updateDocumentVectorSource: mockUpdateDocumentVectorSource,
}));

// ── Helpers ──────────────────────────────────────────────────────────

function mountRoutes(
  routes: Array<{ path: string; method: string; middleware?: unknown[]; handler: (...args: never) => unknown }>,
) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    (app as any)[route.method.toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

/**
 * Build a chainable drizzle-like mock. Returns a Promise that resolves to `result`,
 * extended with drizzle query builder methods that each return the same Promise.
 * Using Promise as the base avoids needing to attach a custom `.then` property.
 */
function chainable(result: unknown) {
  const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
  const methods = ['from', 'where', 'set', 'values', 'returning', 'update'];
  for (const m of methods) {
    p[m] = vi.fn().mockReturnValue(p);
  }
  return p;
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

function makeTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    sourceType: 's3',
    source: 'my-bucket',
    config: { bucket: 'my-bucket', region: 'us-east-1' },
    ...overrides,
  };
}

// ── App setup ────────────────────────────────────────────────────────

let app: Hono;

beforeEach(async () => {
  vi.resetAllMocks();

  // Default provider with download + deleteObject + copyObject
  mockGetProvider.mockReturnValue({
    download: vi.fn().mockResolvedValue(Buffer.from('file content')),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    copyObject: vi.fn().mockResolvedValue(undefined),
  });

  mockNeedsCustomParser.mockReturnValue(false);
  mockGetParser.mockReturnValue(vi.fn().mockResolvedValue({ text: 'parsed text' }));
  mockDeleteDocumentVectors.mockResolvedValue(undefined);
  mockUpdateDocumentVectorSource.mockResolvedValue(undefined);
  mockAdd.mockResolvedValue(undefined);

  const { documentRoutes } = await import('./documents');
  // biome-ignore lint/suspicious/noExplicitAny: test setup
  app = mountRoutes(documentRoutes as any);
});

// ── GET /v1/documents ────────────────────────────────────────────────

describe('GET /v1/documents', () => {
  it('returns all documents without filter', async () => {
    const docs = [makeDoc(), makeDoc({ id: 'doc-2' })];
    const chain = chainable(docs);
    mockDbSelect.mockReturnValue(chain);

    const res = await app.request('/v1/documents');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
  });

  it('filters by syncTargetId query param', async () => {
    const docs = [makeDoc()];
    const chain = chainable(docs);
    chain.where = vi.fn().mockResolvedValue(docs);
    mockDbSelect.mockReturnValue(chain);

    const res = await app.request('/v1/documents?syncTargetId=target-1');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    // where() should have been called when syncTargetId is provided
    expect(chain.where).toHaveBeenCalled();
  });
});

// ── GET /v1/documents/:id ────────────────────────────────────────────

describe('GET /v1/documents/:id', () => {
  it('returns document when found', async () => {
    const doc = makeDoc();
    mockDbSelect.mockReturnValue(chainable([doc]));

    const res = await app.request('/v1/documents/doc-1');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('doc-1');
  });

  it('returns 404 for missing document', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

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
    mockDbSelect.mockReturnValue(chainable([doc]));
    mockGetChunksByDocumentId.mockResolvedValue([
      { id: 'c1', metadata: { text: 'first chunk', startIndex: 0 } },
      { id: 'c2', metadata: { text: 'second chunk', startIndex: 10 } },
    ]);

    const res = await app.request('/v1/documents/doc-1/chunks');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.document.id).toBe('doc-1');
    expect(json.chunks).toHaveLength(2);
    expect(json.chunks[0]).toEqual({ text: 'first chunk', startIndex: 0 });
    expect(json.chunks[1]).toEqual({ text: 'second chunk', startIndex: 10 });
  });

  it('returns 404 when document not found', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/missing/chunks');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('handles metadata with text and startIndex', async () => {
    const doc = makeDoc();
    mockDbSelect.mockReturnValue(chainable([doc]));
    mockGetChunksByDocumentId.mockResolvedValue([{ id: 'c1', metadata: { text: 'chunk text', startIndex: 5 } }]);

    const res = await app.request('/v1/documents/doc-1/chunks');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chunks[0]).toEqual({ text: 'chunk text', startIndex: 5 });
  });

  it('uses null for missing startIndex and empty string for missing text', async () => {
    const doc = makeDoc();
    mockDbSelect.mockReturnValue(chainable([doc]));
    mockGetChunksByDocumentId.mockResolvedValue([{ id: 'c1', metadata: {} }]);

    const res = await app.request('/v1/documents/doc-1/chunks');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chunks[0]).toEqual({ text: '', startIndex: null });
  });
});

// ── GET /v1/documents/:id/parsed-content ────────────────────────────

describe('GET /v1/documents/:id/parsed-content', () => {
  it('returns 404 when document not found', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/missing/parsed-content');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 404 when sync target not found', async () => {
    const doc = makeDoc();
    // First call returns doc, second returns no target
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([]));

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });

  it('returns parsed text for custom parser files (pdf)', async () => {
    const doc = makeDoc({ sourceKey: 'docs/report.pdf' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    mockNeedsCustomParser.mockReturnValue(true);
    const mockParser = vi.fn().mockResolvedValue({ text: 'extracted pdf text' });
    mockGetParser.mockReturnValue(mockParser);

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('extracted pdf text');
    expect(mockParser).toHaveBeenCalled();
  });

  it('returns parsed text for custom parser files (docx)', async () => {
    const doc = makeDoc({ sourceKey: 'docs/report.docx' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    mockNeedsCustomParser.mockReturnValue(true);
    const mockParser = vi.fn().mockResolvedValue({ text: 'extracted docx text' });
    mockGetParser.mockReturnValue(mockParser);

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('extracted docx text');
  });

  it('returns UTF-8 text for plain text files', async () => {
    const doc = makeDoc({ sourceKey: 'readme.txt' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    mockNeedsCustomParser.mockReturnValue(false);
    const provider = { download: vi.fn().mockResolvedValue(Buffer.from('plain text content')) };
    mockGetProvider.mockReturnValue(provider);

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toBe('plain text content');
  });

  it('returns 400 when no parser available for file type', async () => {
    const doc = makeDoc({ sourceKey: 'file.xyz' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    mockNeedsCustomParser.mockReturnValue(true);
    mockGetParser.mockReturnValue(null);

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('No parser available');
  });

  it('returns Cache-Control and ETag headers when contentHash exists', async () => {
    const doc = makeDoc({ sourceKey: 'readme.txt', contentHash: 'abc123' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockNeedsCustomParser.mockReturnValue(false);

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('ETag')).toBe('abc123');
  });

  it('returns Cache-Control without ETag when contentHash is null', async () => {
    const doc = makeDoc({ sourceKey: 'readme.txt', contentHash: null });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockNeedsCustomParser.mockReturnValue(false);

    const res = await app.request('/v1/documents/doc-1/parsed-content');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('ETag')).toBeNull();
  });

  it('returns 304 Not Modified when If-None-Match matches contentHash', async () => {
    const doc = makeDoc({ contentHash: 'abc123' });
    mockDbSelect.mockReturnValueOnce(chainable([doc]));

    const res = await app.request('/v1/documents/doc-1/parsed-content', {
      headers: { 'If-None-Match': 'abc123' },
    });
    expect(res.status).toBe(304);
    // Should not have downloaded from S3
    expect(mockGetProvider().download).not.toHaveBeenCalled();
  });

  it('fetches from S3 when If-None-Match does not match contentHash', async () => {
    const doc = makeDoc({ sourceKey: 'readme.txt', contentHash: 'abc123' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockNeedsCustomParser.mockReturnValue(false);

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
    const doc = makeDoc({ sourceKey: 'folder/report.pdf', mimeType: 'application/pdf' });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    const fileContent = Buffer.from('pdf binary content');
    const provider = { download: vi.fn().mockResolvedValue(fileContent) };
    mockGetProvider.mockReturnValue(provider);

    const res = await app.request('/v1/documents/doc-1/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="report.pdf"');
    expect(res.headers.get('Content-Length')).toBe(String(fileContent.byteLength));
  });

  it('falls back to octet-stream when mimeType is null', async () => {
    const doc = makeDoc({ sourceKey: 'folder/file.bin', mimeType: null });
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    const provider = { download: vi.fn().mockResolvedValue(Buffer.from('data')) };
    mockGetProvider.mockReturnValue(provider);

    const res = await app.request('/v1/documents/doc-1/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('returns 404 when document not found', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/missing/download');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 404 when sync target not found', async () => {
    const doc = makeDoc();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([]));

    const res = await app.request('/v1/documents/doc-1/download');
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });
});

// ── POST /v1/documents/:id/retry ─────────────────────────────────────

describe('POST /v1/documents/:id/retry', () => {
  it('returns 404 for missing document', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/missing/retry', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 when status is not parse_error or embed_error', async () => {
    const doc = makeDoc({ status: 'ready' });
    mockDbSelect.mockReturnValue(chainable([doc]));

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Document is not in an error state');
  });

  it('enqueues process-file job and updates status for parse_error', async () => {
    const doc = makeDoc({ status: 'parse_error' });
    const target = makeTarget();
    const updated = makeDoc({ status: 'processing' });

    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable([updated]));

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processing');

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith(
      'process-file',
      expect.objectContaining({ syncTargetId: doc.syncTargetId, documentId: doc.id, isUpdate: true }),
    );
  });

  it('enqueues process-file job and updates status for embed_error', async () => {
    const doc = makeDoc({ status: 'embed_error' });
    const target = makeTarget();
    const updated = makeDoc({ status: 'processing' });

    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable([updated]));

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(mockAdd).toHaveBeenCalledWith('process-file', expect.objectContaining({ documentId: 'doc-1' }));
  });

  it('returns 404 when sync target not found', async () => {
    const doc = makeDoc({ status: 'parse_error' });
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([]));

    const res = await app.request('/v1/documents/doc-1/retry', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });
});

// ── POST /v1/documents/:id/resync ────────────────────────────────────

describe('POST /v1/documents/:id/resync', () => {
  it('returns 404 for missing document', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/missing/resync', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 for deleted documents', async () => {
    const doc = makeDoc({ status: 'deleted' });
    mockDbSelect.mockReturnValue(chainable([doc]));

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Cannot re-sync a deleted document');
  });

  it('returns 409 for processing documents', async () => {
    const doc = makeDoc({ status: 'processing' });
    mockDbSelect.mockReturnValue(chainable([doc]));

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Document is already being processed');
  });

  it('returns 409 for pending documents', async () => {
    const doc = makeDoc({ status: 'pending' });
    mockDbSelect.mockReturnValue(chainable([doc]));

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Document is already being processed');
  });

  it('enqueues process-file job for ready documents', async () => {
    const doc = makeDoc({ status: 'ready' });
    const target = makeTarget();
    const updated = makeDoc({ status: 'processing' });

    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable([updated]));

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processing');
    expect(mockAdd).toHaveBeenCalledWith(
      'process-file',
      expect.objectContaining({ documentId: 'doc-1', isUpdate: true }),
    );
  });

  it('returns 404 when sync target not found', async () => {
    const doc = makeDoc({ status: 'ready' });
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([]));

    const res = await app.request('/v1/documents/doc-1/resync', { method: 'POST' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Sync target not found');
  });
});

// ── DELETE /v1/documents/:id ─────────────────────────────────────────

describe('DELETE /v1/documents/:id', () => {
  it('calls deleteDocumentVectors, marks document as deleted, and returns { ok: true }', async () => {
    const doc = makeDoc();
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable(undefined));

    const res = await app.request('/v1/documents/doc-1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });

    expect(mockDeleteDocumentVectors).toHaveBeenCalledWith(expect.anything(), 'doc-1');
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('returns 404 for missing document', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/missing', { method: 'DELETE' });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('attempts source object deletion when provider has deleteObject', async () => {
    const doc = makeDoc();
    const target = makeTarget();
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    mockGetProvider.mockReturnValue({ deleteObject });

    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable(undefined));

    const res = await app.request('/v1/documents/doc-1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith(target.config, doc.sourceKey, target.source);
  });

  it('swallows errors from source object deletion (best-effort)', async () => {
    const doc = makeDoc();
    const target = makeTarget();
    const deleteObject = vi.fn().mockRejectedValue(new Error('S3 unreachable'));
    mockGetProvider.mockReturnValue({ deleteObject });

    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable(undefined));

    const res = await app.request('/v1/documents/doc-1', { method: 'DELETE' });
    // Should still return ok even though deletion threw
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('still deletes vectors when sync target is not found', async () => {
    const doc = makeDoc();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([])); // no target
    mockDbUpdate.mockReturnValue(chainable(undefined));

    const res = await app.request('/v1/documents/doc-1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(mockDeleteDocumentVectors).toHaveBeenCalledWith(expect.anything(), 'doc-1');
  });
});

// ── POST /v1/documents/bulk-delete ──────────────────────────────────

describe('POST /v1/documents/bulk-delete', () => {
  it('deletes multiple documents and returns { ok, deleted } count', async () => {
    // Use proper RFC-4122 UUIDs (version nibble 1-8, variant nibble 8-b)
    const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const id2 = 'c7d45e12-3f4a-1b2c-8d9e-0f1a2b3c4d5e';
    const doc1 = makeDoc({ id: id1, syncTargetId: 'target-1' });
    const doc2 = makeDoc({ id: id2, syncTargetId: 'target-1' });
    const target = makeTarget();

    // First call: select docs by ids; subsequent calls: per-target select
    mockDbSelect.mockReturnValueOnce(chainable([doc1, doc2])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable(undefined));

    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id1, id2] }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(2);
    expect(mockDeleteDocumentVectors).toHaveBeenCalledTimes(2);
  });

  it('returns { ok: true, deleted: 0 } for empty ID list', async () => {
    // Empty ids array — Zod passes, handler calls select with inArray([]) → []
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });

    // Zod allows empty array — but docs.length === 0 returns early
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 0 });
    expect(mockDeleteDocumentVectors).not.toHaveBeenCalled();
  });

  it('validates UUID array (rejects non-UUIDs)', async () => {
    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['not-a-uuid'] }),
    });

    expect(res.status).toBe(500); // Zod parse throws, unhandled → 500
  });

  it('validates UUID array (rejects over 100 ids)', async () => {
    // Generate 101 valid RFC-4122 UUIDs
    const base = 'a0eebc99-9c0b-4ef8-bb6d-';
    const ids = Array.from({ length: 101 }, (_, i) => `${base}${String(i).padStart(12, '0')}`);
    const res = await app.request('/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    expect(res.status).toBe(500); // Zod parse throws, unhandled → 500
  });
});

// ── POST /v1/documents/:id/move ──────────────────────────────────────

describe('POST /v1/documents/:id/move', () => {
  it('returns 404 for missing document', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

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
    const doc = makeDoc();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([]));

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
    const doc = makeDoc();
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    // Provider without copyObject
    mockGetProvider.mockReturnValue({
      download: vi.fn(),
      deleteObject: vi.fn(),
      // no copyObject
    });

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
    const doc = makeDoc();
    const target = makeTarget();
    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));

    // Provider without deleteObject
    mockGetProvider.mockReturnValue({
      download: vi.fn(),
      copyObject: vi.fn(),
      // no deleteObject
    });

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
    const doc = makeDoc({ sourceKey: 'old/path.pdf' });
    const target = makeTarget();
    const updated = makeDoc({ sourceKey: 'new/path.pdf' });

    mockDbSelect.mockReturnValueOnce(chainable([doc])).mockReturnValueOnce(chainable([target]));
    mockDbUpdate.mockReturnValue(chainable([updated]));

    const copyObject = vi.fn().mockResolvedValue(undefined);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    mockGetProvider.mockReturnValue({ copyObject, deleteObject });

    const res = await app.request('/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newSourceKey: 'new/path.pdf' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sourceKey).toBe('new/path.pdf');

    // Verify copy was called with old → new
    expect(copyObject).toHaveBeenCalledWith(target.config, 'old/path.pdf', 'new/path.pdf', target.source);
    // Verify DB update
    expect(mockDbUpdate).toHaveBeenCalled();
    // Verify vector metadata update
    expect(mockUpdateDocumentVectorSource).toHaveBeenCalledWith(expect.anything(), 'doc-1', 'new/path.pdf');
    // Verify old key deleted
    expect(deleteObject).toHaveBeenCalledWith(target.config, 'old/path.pdf', target.source);
  });
});
