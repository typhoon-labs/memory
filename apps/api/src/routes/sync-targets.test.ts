import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockSyncQueueAdd,
  mockDeleteDocumentVectors,
  mockGetProvider,
  mockListSources,
  mockUpdateDocumentVectorSource,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockSyncQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockDeleteDocumentVectors: vi.fn().mockResolvedValue(undefined),
  mockGetProvider: vi.fn(),
  mockListSources: vi.fn(),
  mockUpdateDocumentVectorSource: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
  sql: {},
}));

vi.mock('@typhoon/db', () => ({
  documents: {
    id: 'documents.id',
    syncTargetId: 'documents.syncTargetId',
    sourceKey: 'documents.sourceKey',
    sourceEtag: 'documents.sourceEtag',
    fileSize: 'documents.fileSize',
    mimeType: 'documents.mimeType',
    status: 'documents.status',
    errorMessage: 'documents.errorMessage',
    lastSyncedAt: 'documents.lastSyncedAt',
    createdAt: 'documents.createdAt',
    updatedAt: 'documents.updatedAt',
  },
  syncTargets: {
    id: 'syncTargets.id',
    name: 'syncTargets.name',
    sourceType: 'syncTargets.sourceType',
    config: 'syncTargets.config',
    cronSchedule: 'syncTargets.cronSchedule',
    isActive: 'syncTargets.isActive',
    managedBy: 'syncTargets.managedBy',
    source: 'syncTargets.source',
    createdAt: 'syncTargets.createdAt',
    updatedAt: 'syncTargets.updatedAt',
  },
  syncJobs: {
    id: 'syncJobs.id',
    syncTargetId: 'syncJobs.syncTargetId',
  },
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

vi.mock('../queue', () => ({
  getSyncQueue: () => ({ add: mockSyncQueueAdd }),
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  PgVector: class MockPgVector {},
}));

vi.mock('@typhoon/ingestion', () => ({
  deleteDocumentVectors: mockDeleteDocumentVectors,
  getProvider: mockGetProvider,
  listSources: mockListSources,
  updateDocumentVectorSource: mockUpdateDocumentVectorSource,
  cancelSyncJob: vi.fn().mockResolvedValue({ removed: 0 }),
  JOB_PRIORITY: { MANUAL: 1, UPLOAD: 2, CRON: 5 },
  makeJobId: vi.fn((...parts: string[]) => parts.join('-').slice(0, 36)),
}));

vi.mock('@typhoon/types', () => ({
  // Empty object means no schema validation for any sourceType by default.
  syncTargetConfigSchemas: {},
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { syncTargetRoutes } from './sync-targets';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a drizzle-style chainable query mock that resolves to `result`.
 * Every chain method returns the same proxy, and awaiting it yields `result`.
 */
function chainable(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'from',
    'where',
    'set',
    'values',
    'returning',
    'orderBy',
    'limit',
    'offset',
    'innerJoin',
    'onConflictDoUpdate',
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // Make awaitable (drizzle builders are PromiseLike)
  // biome-ignore lint/suspicious/noThenProperty: required for drizzle mock thenability
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve));
  return chain;
}

/** Mount the exported route descriptors onto a real Hono app for testing. */
function mountRoutes(routes: Array<Record<string, unknown>>) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    (app as any)[String(route.method).toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeSyncTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    name: 'My S3 Bucket',
    sourceType: 's3',
    config: { bucket: 'my-bucket', prefix: 'docs/' },
    cronSchedule: '0 */6 * * *',
    isActive: true,
    managedBy: null,
    source: 'my-source',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeDocument(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01');
  return {
    id: 'doc-1',
    syncTargetId: 'target-1',
    sourceKey: 'docs/file.pdf',
    sourceEtag: 'etag-123',
    fileSize: 1024,
    mimeType: 'application/pdf',
    status: 'synced',
    errorMessage: null,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  // biome-ignore lint/suspicious/noExplicitAny: test setup
  app = mountRoutes(syncTargetRoutes as any);
});

// ── GET /v1/sources ───────────────────────────────────────────────────────────

describe('GET /v1/sources', () => {
  it('returns list of sources with name and sourceType', async () => {
    mockListSources.mockReturnValue([
      { name: 'S3', sourceType: 's3', description: 'Amazon S3' },
      { name: 'Local', sourceType: 'local', description: 'Local FS' },
    ]);

    const res = await app.request('/v1/sources');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([
      { name: 'S3', sourceType: 's3' },
      { name: 'Local', sourceType: 'local' },
    ]);
  });

  it('returns empty array when no sources registered', async () => {
    mockListSources.mockReturnValue([]);

    const res = await app.request('/v1/sources');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

// ── GET /v1/sync-targets ──────────────────────────────────────────────────────

describe('GET /v1/sync-targets', () => {
  it('returns all sync targets', async () => {
    const targets = [makeSyncTarget(), makeSyncTarget({ id: 'target-2', name: 'Second' })];
    mockDbSelect.mockReturnValue(chainable(targets));

    const res = await app.request('/v1/sync-targets');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].id).toBe('target-1');
    expect(json[1].id).toBe('target-2');
  });

  it('returns empty array when no targets exist', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

// ── POST /v1/sync-targets ─────────────────────────────────────────────────────

describe('POST /v1/sync-targets', () => {
  it('creates sync target with valid body and returns 201', async () => {
    const created = makeSyncTarget();
    const insertChain = chainable([created]);
    mockDbInsert.mockReturnValue(insertChain);

    const res = await app.request('/v1/sync-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My S3 Bucket',
        sourceType: 's3',
        config: { bucket: 'my-bucket' },
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('target-1');
    expect(json.name).toBe('My S3 Bucket');
  });

  it('returns 400 when config fails schema validation for known sourceType', async () => {
    // Override the mock to provide a schema for 's3'
    const { syncTargetConfigSchemas } = await import('@typhoon/types');
    const { z } = await import('zod');
    // Temporarily inject a schema by patching the mock module's export object
    // We can't re-mock inside a test, so we test with a real Zod schema via the mock factory.
    // Instead, we re-import with module reset to inject config schema:
    (syncTargetConfigSchemas as Record<string, unknown>)['custom-type'] = z.object({
      requiredField: z.string(),
    });

    try {
      const res = await app.request('/v1/sync-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Target',
          sourceType: 'custom-type',
          config: { wrongField: 'value' },
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Invalid config/);
    } finally {
      // Cleanup the temporarily injected schema
      delete (syncTargetConfigSchemas as Record<string, unknown>)['custom-type'];
    }
  });

  it('creates without config validation for unknown sourceType', async () => {
    const created = makeSyncTarget({ sourceType: 'unknown-type' });
    const insertChain = chainable([created]);
    mockDbInsert.mockReturnValue(insertChain);

    const res = await app.request('/v1/sync-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unknown Source',
        sourceType: 'unknown-type',
        config: { anything: 'goes' },
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.sourceType).toBe('unknown-type');
  });
});

// ── GET /v1/sync-targets/:id ──────────────────────────────────────────────────

describe('GET /v1/sync-targets/:id', () => {
  it('returns the sync target', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));

    const res = await app.request('/v1/sync-targets/target-1');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('target-1');
    expect(json.name).toBe('My S3 Bucket');
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent');

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
  });
});

// ── PATCH /v1/sync-targets/:id ────────────────────────────────────────────────

describe('PATCH /v1/sync-targets/:id', () => {
  it('updates sync target and returns the updated record', async () => {
    const existing = makeSyncTarget();
    const updated = makeSyncTarget({ name: 'Renamed' });

    mockDbSelect.mockReturnValue(chainable([existing]));
    const updateChain = chainable([updated]);
    mockDbUpdate.mockReturnValue(updateChain);

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Renamed');
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
  });

  it('returns 403 when managedBy is config', async () => {
    const managed = makeSyncTarget({ managedBy: 'config' });
    mockDbSelect.mockReturnValue(chainable([managed]));

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cannot Change' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Cannot edit config-managed sync target' });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

// ── DELETE /v1/sync-targets/:id ───────────────────────────────────────────────

describe('DELETE /v1/sync-targets/:id', () => {
  it('deletes sync target and document vectors, returns { ok: true }', async () => {
    const target = makeSyncTarget();
    const docs = [{ id: 'doc-1' }, { id: 'doc-2' }];

    // First select: get target; second select: get documents
    mockDbSelect.mockReturnValueOnce(chainable([target])).mockReturnValueOnce(chainable(docs));
    const deleteChain = chainable(undefined);
    mockDbDelete.mockReturnValue(deleteChain);

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockDeleteDocumentVectors).toHaveBeenCalledTimes(2);
    expect(mockDeleteDocumentVectors).toHaveBeenCalledWith(expect.anything(), 'doc-1');
    expect(mockDeleteDocumentVectors).toHaveBeenCalledWith(expect.anything(), 'doc-2');
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it('returns 403 when managedBy is config', async () => {
    const managed = makeSyncTarget({ managedBy: 'config' });
    mockDbSelect.mockReturnValue(chainable([managed]));

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Cannot delete config-managed sync target' });
    expect(mockDbDelete).not.toHaveBeenCalled();
  });
});

// ── POST /v1/sync-targets/:id/sync ───────────────────────────────────────────

describe('POST /v1/sync-targets/:id/sync', () => {
  it('enqueues scan job and returns { ok: true, message }', async () => {
    const target = makeSyncTarget({ name: 'My Bucket' });
    mockDbSelect.mockReturnValue(chainable([target]));

    const res = await app.request('/v1/sync-targets/target-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('My Bucket');
    expect(mockSyncQueueAdd).toHaveBeenCalledWith(
      'scan',
      { syncTargetId: 'target-1', force: false },
      expect.objectContaining({ jobId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-/) }),
    );
  });

  it('forwards force flag from body', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));

    const res = await app.request('/v1/sync-targets/target-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });

    expect(res.status).toBe(200);
    expect(mockSyncQueueAdd).toHaveBeenCalledWith(
      'scan',
      { syncTargetId: 'target-1', force: true },
      expect.objectContaining({ jobId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-/) }),
    );
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    expect(mockSyncQueueAdd).not.toHaveBeenCalled();
  });

  it('returns 400 when target is inactive', async () => {
    const inactive = makeSyncTarget({ isActive: false });
    mockDbSelect.mockReturnValue(chainable([inactive]));

    const res = await app.request('/v1/sync-targets/target-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Sync target is inactive');
    expect(mockSyncQueueAdd).not.toHaveBeenCalled();
  });
});

// ── POST /v1/sync-targets/:id/purge ──────────────────────────────────────────

describe('POST /v1/sync-targets/:id/purge', () => {
  it('deletes vectors for non-deleted docs, marks as deleted, returns { ok, purged }', async () => {
    const target = makeSyncTarget();
    const docs = [
      { id: 'doc-1', sourceKey: 'docs/a.pdf' },
      { id: 'doc-2', sourceKey: 'docs/b.pdf' },
    ];

    mockDbSelect.mockReturnValueOnce(chainable([target])).mockReturnValueOnce(chainable(docs));
    const updateChain = chainable([]);
    mockDbUpdate.mockReturnValue(updateChain);

    const res = await app.request('/v1/sync-targets/target-1/purge', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, purged: 2 });
    expect(mockDeleteDocumentVectors).toHaveBeenCalledTimes(2);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns { ok: true, purged: 0 } when no non-deleted docs', async () => {
    const target = makeSyncTarget();

    mockDbSelect.mockReturnValueOnce(chainable([target])).mockReturnValueOnce(chainable([]));

    const res = await app.request('/v1/sync-targets/target-1/purge', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, purged: 0 });
    expect(mockDeleteDocumentVectors).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent/purge', {
      method: 'POST',
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
  });
});

// ── POST /v1/sync-targets/:id/upload ─────────────────────────────────────────

describe('POST /v1/sync-targets/:id/upload', () => {
  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const formData = new FormData();
    formData.append('files', new File(['hello'], 'test.txt', { type: 'text/plain' }));

    const res = await app.request('/v1/sync-targets/nonexistent/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when provider does not support upload', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({}); // no upload method

    const formData = new FormData();
    formData.append('files', new File(['hello'], 'test.txt'));

    const res = await app.request('/v1/sync-targets/target-1/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Upload is not supported for this source type');
  });

  it('returns 400 when no files provided', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ upload: vi.fn() });

    // Send an empty form (no files field)
    const formData = new FormData();

    const res = await app.request('/v1/sync-targets/target-1/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('No files provided');
  });

  it('uploads file, inserts document, enqueues process-file job, returns 201', async () => {
    const target = makeSyncTarget({ config: { bucket: 'my-bucket', prefix: 'docs/' } });
    const uploadFn = vi.fn().mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ upload: uploadFn });

    const now = new Date('2026-01-01');
    const doc = makeDocument({ createdAt: now, updatedAt: now });
    const insertChain = chainable([doc]);
    mockDbInsert.mockReturnValue(insertChain);

    const file = new File(['file content'], 'report.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('files', file);

    const res = await app.request('/v1/sync-targets/target-1/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn).toHaveBeenCalledWith(
      expect.any(Object),
      'docs/report.pdf',
      expect.any(Buffer),
      'application/pdf',
      'my-source',
    );

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockSyncQueueAdd).toHaveBeenCalledWith(
      'process-file',
      expect.objectContaining({
        syncTargetId: 'target-1',
        sourceKey: 'docs/report.pdf',
        sourceType: 's3',
      }),
      expect.objectContaining({ priority: 2 }),
    );
  });

  it('builds correct sourceKey with sub-path from body.path', async () => {
    const target = makeSyncTarget({ config: { bucket: 'my-bucket', prefix: 'base/' } });
    const uploadFn = vi.fn().mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ upload: uploadFn });

    const now = new Date('2026-01-01');
    const doc = makeDocument({ createdAt: now, updatedAt: now, sourceKey: 'base/sub/report.pdf' });
    mockDbInsert.mockReturnValue(chainable([doc]));

    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('files', file);
    formData.append('path', '/sub/'); // with leading/trailing slashes to be trimmed

    const res = await app.request('/v1/sync-targets/target-1/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(uploadFn).toHaveBeenCalledWith(
      expect.any(Object),
      'base/sub/report.pdf',
      expect.any(Buffer),
      'application/pdf',
      'my-source',
    );
  });
});

// ── GET /v1/sync-targets/:id/browse ──────────────────────────────────────────

describe('GET /v1/sync-targets/:id/browse', () => {
  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent/browse');

    expect(res.status).toBe(404);
  });

  it('returns 400 when provider does not support browse', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({}); // no browse method

    const res = await app.request('/v1/sync-targets/target-1/browse');

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Browse is not supported for this source type');
  });

  it('returns { path, folders, files } with enriched document info', async () => {
    const target = makeSyncTarget();
    const browseFn = vi.fn().mockResolvedValue({
      folders: ['docs/reports/'],
      objects: [
        { key: 'docs/file.pdf', size: 1024, lastModified: '2026-01-01' },
        { key: 'docs/other.txt', size: 256, lastModified: '2026-01-02' },
      ],
    });
    const doc = makeDocument({ sourceKey: 'docs/file.pdf' });

    mockDbSelect.mockReturnValueOnce(chainable([target])).mockReturnValueOnce(chainable([doc]));
    mockGetProvider.mockReturnValue({ browse: browseFn });

    const res = await app.request('/v1/sync-targets/target-1/browse?path=docs/');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe('docs/');
    expect(json.folders).toEqual(['docs/reports/']);
    expect(json.files).toHaveLength(2);

    // File with matching document should be enriched
    const enriched = json.files.find((f: { sourceKey: string }) => f.sourceKey === 'docs/file.pdf');
    expect(enriched.document).not.toBeNull();
    expect(enriched.document.id).toBe('doc-1');

    // File with no matching document should have document: null
    const bare = json.files.find((f: { sourceKey: string }) => f.sourceKey === 'docs/other.txt');
    expect(bare.document).toBeNull();
  });

  it('skips DB query when provider returns no objects', async () => {
    const target = makeSyncTarget();
    const browseFn = vi.fn().mockResolvedValue({ folders: [], objects: [] });
    mockDbSelect.mockReturnValueOnce(chainable([target]));
    mockGetProvider.mockReturnValue({ browse: browseFn });

    const res = await app.request('/v1/sync-targets/target-1/browse');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.files).toEqual([]);
    // Only one select call (for the target), not a second one for docs
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });
});

// ── POST /v1/sync-targets/:id/folders ────────────────────────────────────────

describe('POST /v1/sync-targets/:id/folders', () => {
  it('returns 400 when provider does not support createFolder', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({}); // no createFolder method

    const res = await app.request('/v1/sync-targets/target-1/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'new-folder/' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Folder creation is not supported for this source type');
  });

  it('creates folder at the correct path with prefix', async () => {
    const target = makeSyncTarget({ config: { bucket: 'my-bucket', prefix: 'base' } }); // prefix without trailing slash
    const createFolderFn = vi.fn().mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ createFolder: createFolderFn });

    const res = await app.request('/v1/sync-targets/target-1/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'new-folder/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, path: 'new-folder/' });

    // Prefix "base" should become "base/" before concatenating
    expect(createFolderFn).toHaveBeenCalledWith(expect.any(Object), 'base/new-folder/', 'my-source');
  });

  it('creates folder at correct path without prefix', async () => {
    // source: null so target.source ?? undefined evaluates to undefined
    const target = makeSyncTarget({ config: { bucket: 'my-bucket' }, source: null });
    const createFolderFn = vi.fn().mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ createFolder: createFolderFn });

    await app.request('/v1/sync-targets/target-1/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'archive/' }),
    });

    expect(createFolderFn).toHaveBeenCalledWith(expect.any(Object), 'archive/', undefined);
  });
});

// ── POST /v1/sync-targets/:id/folders/delete ─────────────────────────────────

describe('POST /v1/sync-targets/:id/folders/delete', () => {
  it('deletes document vectors, soft deletes docs, and returns { ok, deleted }', async () => {
    const target = makeSyncTarget({ config: { bucket: 'my-bucket', prefix: 'base/' } });
    const deleteObjectFn = vi.fn().mockResolvedValue(undefined);
    const docs = [
      makeDocument({ id: 'doc-1', sourceKey: 'base/reports/a.pdf' }),
      makeDocument({ id: 'doc-2', sourceKey: 'base/reports/b.pdf' }),
    ];

    mockDbSelect.mockReturnValueOnce(chainable([target])).mockReturnValueOnce(chainable(docs));
    mockGetProvider.mockReturnValue({ deleteObject: deleteObjectFn });

    const updateChain = chainable([]);
    mockDbUpdate.mockReturnValue(updateChain);

    const res = await app.request('/v1/sync-targets/target-1/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'reports/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 2 });

    expect(mockDeleteDocumentVectors).toHaveBeenCalledTimes(2);
    // deleteObject called per doc + folder placeholder
    expect(deleteObjectFn).toHaveBeenCalledWith(expect.any(Object), 'base/reports/a.pdf', 'my-source');
    expect(deleteObjectFn).toHaveBeenCalledWith(expect.any(Object), 'base/reports/b.pdf', 'my-source');
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns { ok: true, deleted: 0 } and skips DB update when no docs found', async () => {
    const target = makeSyncTarget();
    const deleteObjectFn = vi.fn().mockResolvedValue(undefined);

    mockDbSelect.mockReturnValueOnce(chainable([target])).mockReturnValueOnce(chainable([]));
    mockGetProvider.mockReturnValue({ deleteObject: deleteObjectFn });

    const res = await app.request('/v1/sync-targets/target-1/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'empty/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 0 });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'folder/' }),
    });

    expect(res.status).toBe(404);
  });
});

// ── POST /v1/sync-targets/:id/folders/move ───────────────────────────────────

describe('POST /v1/sync-targets/:id/folders/move', () => {
  it('returns 400 when provider does not support move (no copyObject)', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ deleteObject: vi.fn() }); // no copyObject

    const res = await app.request('/v1/sync-targets/target-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Folder move is not supported for this source type');
  });

  it('returns 400 when provider does not support move (no deleteObject)', async () => {
    const target = makeSyncTarget();
    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({ copyObject: vi.fn() }); // no deleteObject

    const res = await app.request('/v1/sync-targets/target-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(400);
  });

  it('moves files from oldPath to newPath, updates DB and vectors', async () => {
    const target = makeSyncTarget({ config: { bucket: 'my-bucket', prefix: 'base/' } });
    const copyFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const listFn = vi.fn().mockResolvedValue([
      { key: 'base/old/file1.pdf' },
      { key: 'base/old/file2.pdf' },
      { key: 'base/other/file3.pdf' }, // should NOT be moved
    ]);

    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({
      copyObject: copyFn,
      deleteObject: deleteFn,
      listObjects: listFn,
    });

    const doc = makeDocument({ id: 'doc-1', sourceKey: 'base/old/file1.pdf' });
    const updateChain = chainable([doc]);
    mockDbUpdate.mockReturnValue(updateChain);

    const res = await app.request('/v1/sync-targets/target-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, moved: 2 });

    // Only the two files under base/old/ should be moved
    expect(copyFn).toHaveBeenCalledTimes(2);
    expect(deleteFn).toHaveBeenCalledTimes(2);

    expect(copyFn).toHaveBeenCalledWith(expect.any(Object), 'base/old/file1.pdf', 'base/new/file1.pdf', 'my-source');
    expect(copyFn).toHaveBeenCalledWith(expect.any(Object), 'base/old/file2.pdf', 'base/new/file2.pdf', 'my-source');

    // Vector metadata update should be called for doc that exists in DB
    expect(mockUpdateDocumentVectorSource).toHaveBeenCalledWith(expect.anything(), 'doc-1', 'base/new/file1.pdf');
  });

  it('returns 404 for missing target', async () => {
    mockDbSelect.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/nonexistent/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(404);
  });

  it('skips vector update when doc is not in DB', async () => {
    const target = makeSyncTarget({ config: { bucket: 'b', prefix: '' } });
    const copyFn = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const listFn = vi.fn().mockResolvedValue([{ key: 'old/orphan.pdf' }]);

    mockDbSelect.mockReturnValue(chainable([target]));
    mockGetProvider.mockReturnValue({
      copyObject: copyFn,
      deleteObject: deleteFn,
      listObjects: listFn,
    });

    // update returns empty array — no doc found in DB
    mockDbUpdate.mockReturnValue(chainable([]));

    const res = await app.request('/v1/sync-targets/target-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateDocumentVectorSource).not.toHaveBeenCalled();
  });
});
