import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockService } = vi.hoisted(() => ({
  mockService: {
    listSources: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    sync: vi.fn(),
    cancelSync: vi.fn(),
    purge: vi.fn(),
    listJobs: vi.fn(),
    upload: vi.fn(),
    browse: vi.fn(),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveFolder: vi.fn(),
  },
}));

vi.mock('../services', () => ({
  getSyncTargetService: () => mockService,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { syncTargetRoutes } from './sync-targets';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mount the exported route descriptors onto a real Hono app for testing. */
function mountRoutes(routes: Array<Record<string, unknown>>) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[String(route.method).toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeSyncTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'target-1',
    name: 'My S3 Bucket',
    sourceType: 's3',
    config: { prefix: 'docs/' },
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
  app = mountRoutes(syncTargetRoutes as any);
});

// ── GET /v1/sources ───────────────────────────────────────────────────────────

describe('GET /v1/sources', () => {
  it('returns list of sources with name and sourceType', async () => {
    mockService.listSources.mockReturnValue([
      { name: 'S3', sourceType: 's3' },
      { name: 'Local', sourceType: 'local' },
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
    mockService.listSources.mockReturnValue([]);

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
    mockService.list.mockResolvedValue({ data: targets });

    const res = await app.request('/v1/sync-targets');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].id).toBe('target-1');
    expect(json[1].id).toBe('target-2');
  });

  it('returns empty array when no targets exist', async () => {
    mockService.list.mockResolvedValue({ data: [] });

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
    mockService.create.mockResolvedValue({ data: { target: created, _status: 201 } });

    const res = await app.request('/v1/sync-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'My S3 Bucket',
        sourceType: 's3',
        config: { prefix: 'docs/' },
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('target-1');
    expect(json.name).toBe('My S3 Bucket');
  });

  it('returns 400 when config fails schema validation for known sourceType', async () => {
    mockService.create.mockResolvedValue({ error: 'Invalid config: requiredField: Required' });

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
  });

  it('creates without config validation for unknown sourceType', async () => {
    const created = makeSyncTarget({ sourceType: 'unknown-type' });
    mockService.create.mockResolvedValue({ data: { target: created, _status: 201 } });

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
    mockService.getById.mockResolvedValue({ data: target });

    const res = await app.request('/v1/sync-targets/target-1');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('target-1');
    expect(json.name).toBe('My S3 Bucket');
  });

  it('returns 404 for missing target', async () => {
    mockService.getById.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/sync-targets/nonexistent');

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
  });
});

// ── PATCH /v1/sync-targets/:id ────────────────────────────────────────────────

describe('PATCH /v1/sync-targets/:id', () => {
  it('updates sync target and returns the updated record', async () => {
    const updated = makeSyncTarget({ name: 'Renamed' });
    mockService.update.mockResolvedValue({ data: updated });

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
    mockService.update.mockResolvedValue({ error: 'not-found' });

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
    mockService.update.mockResolvedValue({ error: 'config-managed-edit' });

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cannot Change' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Cannot edit config-managed sync target' });
  });
});

// ── DELETE /v1/sync-targets/:id ───────────────────────────────────────────────

describe('DELETE /v1/sync-targets/:id', () => {
  it('deletes sync target and returns { ok: true }', async () => {
    mockService.delete.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('returns 404 for missing target', async () => {
    mockService.delete.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/sync-targets/nonexistent', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'Not found' });
  });

  it('returns 403 when managedBy is config', async () => {
    mockService.delete.mockResolvedValue({ error: 'config-managed-delete' });

    const res = await app.request('/v1/sync-targets/target-1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: 'Cannot delete config-managed sync target' });
  });
});

// ── POST /v1/sync-targets/:id/sync ───────────────────────────────────────────

describe('POST /v1/sync-targets/:id/sync', () => {
  it('enqueues scan job and returns { ok: true, message }', async () => {
    mockService.sync.mockResolvedValue({ data: { ok: true, message: 'Sync triggered for My Bucket' } });

    const res = await app.request('/v1/sync-targets/target-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('My Bucket');
    expect(mockService.sync).toHaveBeenCalledWith('target-1', false);
  });

  it('forwards force flag from body', async () => {
    mockService.sync.mockResolvedValue({ data: { ok: true, message: 'Sync triggered for Test' } });

    const res = await app.request('/v1/sync-targets/target-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });

    expect(res.status).toBe(200);
    expect(mockService.sync).toHaveBeenCalledWith('target-1', true);
  });

  it('returns 404 for missing target', async () => {
    mockService.sync.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/sync-targets/nonexistent/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when target is inactive', async () => {
    mockService.sync.mockResolvedValue({ error: 'inactive' });

    const res = await app.request('/v1/sync-targets/target-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Sync target is inactive');
  });
});

// ── POST /v1/sync-targets/:id/purge ──────────────────────────────────────────

describe('POST /v1/sync-targets/:id/purge', () => {
  it('purges documents and returns { ok, purged }', async () => {
    mockService.purge.mockResolvedValue({ data: { ok: true, purged: 2 } });

    const res = await app.request('/v1/sync-targets/target-1/purge', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, purged: 2 });
  });

  it('returns { ok: true, purged: 0 } when no non-deleted docs', async () => {
    mockService.purge.mockResolvedValue({ data: { ok: true, purged: 0 } });

    const res = await app.request('/v1/sync-targets/target-1/purge', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, purged: 0 });
  });

  it('returns 404 for missing target', async () => {
    mockService.purge.mockResolvedValue({ error: 'not-found' });

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
    mockService.upload.mockResolvedValue({ error: 'not-found' });

    const formData = new FormData();
    formData.append('files', new File(['hello'], 'test.txt', { type: 'text/plain' }));

    const res = await app.request('/v1/sync-targets/nonexistent/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when provider does not support upload', async () => {
    mockService.upload.mockResolvedValue({ error: 'upload-not-supported' });

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
    mockService.upload.mockResolvedValue({ error: 'no-files' });

    const formData = new FormData();

    const res = await app.request('/v1/sync-targets/target-1/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('No files provided');
  });

  it('uploads file and returns 201', async () => {
    const doc = makeDocument({ createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
    mockService.upload.mockResolvedValue({ data: { docs: [doc], _status: 201 } });

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
    expect(mockService.upload).toHaveBeenCalledWith(
      'target-1',
      expect.arrayContaining([expect.objectContaining({ name: 'report.pdf' })]),
      undefined,
    );
  });

  it('passes sub-path from body.path to service', async () => {
    const doc = makeDocument({ sourceKey: 'base/sub/report.pdf' });
    mockService.upload.mockResolvedValue({ data: { docs: [doc], _status: 201 } });

    const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('files', file);
    formData.append('path', '/sub/');

    const res = await app.request('/v1/sync-targets/target-1/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(mockService.upload).toHaveBeenCalledWith(
      'target-1',
      expect.arrayContaining([expect.objectContaining({ name: 'report.pdf' })]),
      '/sub/',
    );
  });
});

// ── GET /v1/sync-targets/:id/browse ──────────────────────────────────────────

describe('GET /v1/sync-targets/:id/browse', () => {
  it('returns 404 for missing target', async () => {
    mockService.browse.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/sync-targets/nonexistent/browse');

    expect(res.status).toBe(404);
  });

  it('returns 400 when provider does not support browse', async () => {
    mockService.browse.mockResolvedValue({ error: 'browse-not-supported' });

    const res = await app.request('/v1/sync-targets/target-1/browse');

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Browse is not supported for this source type');
  });

  it('returns { path, folders, files } with enriched document info', async () => {
    const doc = makeDocument({ sourceKey: 'docs/file.pdf' });
    mockService.browse.mockResolvedValue({
      data: {
        path: 'docs/',
        folders: ['docs/reports/'],
        files: [
          { sourceKey: 'docs/file.pdf', size: 1024, lastModified: '2026-01-01', document: doc },
          { sourceKey: 'docs/other.txt', size: 256, lastModified: '2026-01-02', document: null },
        ],
      },
    });

    const res = await app.request('/v1/sync-targets/target-1/browse?path=docs/');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe('docs/');
    expect(json.folders).toEqual(['docs/reports/']);
    expect(json.files).toHaveLength(2);

    const enriched = json.files.find((f: { sourceKey: string }) => f.sourceKey === 'docs/file.pdf');
    expect(enriched.document).not.toBeNull();
    expect(enriched.document.id).toBe('doc-1');

    const bare = json.files.find((f: { sourceKey: string }) => f.sourceKey === 'docs/other.txt');
    expect(bare.document).toBeNull();
  });

  it('returns empty files when provider returns no objects', async () => {
    mockService.browse.mockResolvedValue({
      data: { path: '', folders: [], files: [] },
    });

    const res = await app.request('/v1/sync-targets/target-1/browse');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.files).toEqual([]);
  });
});

// ── POST /v1/sync-targets/:id/folders ────────────────────────────────────────

describe('POST /v1/sync-targets/:id/folders', () => {
  it('returns 400 when provider does not support createFolder', async () => {
    mockService.createFolder.mockResolvedValue({ error: 'create-folder-not-supported' });

    const res = await app.request('/v1/sync-targets/target-1/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'new-folder/' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Folder creation is not supported for this source type');
  });

  it('creates folder and returns { ok: true, path }', async () => {
    mockService.createFolder.mockResolvedValue({ data: { ok: true, path: 'new-folder/' } });

    const res = await app.request('/v1/sync-targets/target-1/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'new-folder/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, path: 'new-folder/' });
    expect(mockService.createFolder).toHaveBeenCalledWith('target-1', 'new-folder/');
  });
});

// ── POST /v1/sync-targets/:id/folders/delete ─────────────────────────────────

describe('POST /v1/sync-targets/:id/folders/delete', () => {
  it('deletes folder contents and returns { ok, deleted }', async () => {
    mockService.deleteFolder.mockResolvedValue({ data: { ok: true, deleted: 2 } });

    const res = await app.request('/v1/sync-targets/target-1/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'reports/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 2 });
  });

  it('returns { ok: true, deleted: 0 } when no docs found', async () => {
    mockService.deleteFolder.mockResolvedValue({ data: { ok: true, deleted: 0 } });

    const res = await app.request('/v1/sync-targets/target-1/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'empty/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 0 });
  });

  it('returns 404 for missing target', async () => {
    mockService.deleteFolder.mockResolvedValue({ error: 'not-found' });

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
  it('returns 400 when provider does not support move', async () => {
    mockService.moveFolder.mockResolvedValue({ error: 'move-folder-not-supported' });

    const res = await app.request('/v1/sync-targets/target-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Folder move is not supported for this source type');
  });

  it('moves files and returns { ok: true, moved }', async () => {
    mockService.moveFolder.mockResolvedValue({ data: { ok: true, moved: 2 } });

    const res = await app.request('/v1/sync-targets/target-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, moved: 2 });
    expect(mockService.moveFolder).toHaveBeenCalledWith('target-1', 'old/', 'new/');
  });

  it('returns 404 for missing target', async () => {
    mockService.moveFolder.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/sync-targets/nonexistent/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'old/', newPath: 'new/' }),
    });

    expect(res.status).toBe(404);
  });
});
