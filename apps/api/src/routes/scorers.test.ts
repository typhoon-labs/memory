import { APP_ROLES } from '@typhoon/config';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockSqlUnsafe, mockStorage, mockConstructScorer } = vi.hoisted(() => ({
  mockSqlUnsafe: vi.fn().mockResolvedValue([]),
  mockStorage: {
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'def-1', status: 'draft' }),
    update: vi.fn().mockResolvedValue({ id: 'def-1', status: 'active' }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ rows: [], total: 0, hasMore: false }),
    createVersion: vi.fn().mockResolvedValue({ id: 'ver-1', version_number: 1, name: 'test' }),
    getVersion: vi.fn().mockResolvedValue(null),
    getLatestVersion: vi.fn().mockResolvedValue(null),
    listVersions: vi.fn().mockResolvedValue({ rows: [], total: 0, hasMore: false }),
    countVersions: vi.fn().mockResolvedValue(0),
  },
  mockConstructScorer: vi.fn().mockReturnValue(null),
}));

// ---------- Module mocks ----------
vi.mock('../db', () => ({
  db: {},
  sql: { unsafe: mockSqlUnsafe },
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: createMiddleware(async (c, next) => {
    c.set('user' as never, { id: 'admin-1', email: 'admin@test.example', role: APP_ROLES.ADMIN });
    await next();
  }),
}));

vi.mock('../middleware/require-admin', () => ({
  requireAdmin: createMiddleware(async (_c, next) => {
    await next();
  }),
}));

vi.mock('@typhoon/db/drivers/pg', () => ({
  DrizzleScorerDefinitionsStorage: class {
    getById = mockStorage.getById;
    create = mockStorage.create;
    update = mockStorage.update;
    delete = mockStorage.delete;
    list = mockStorage.list;
    createVersion = mockStorage.createVersion;
    getVersion = mockStorage.getVersion;
    getLatestVersion = mockStorage.getLatestVersion;
    listVersions = mockStorage.listVersions;
    countVersions = mockStorage.countVersions;
  },
}));

vi.mock('@typhoon/agents', () => ({
  constructScorer: mockConstructScorer,
}));

vi.mock('@typhoon/ai', () => ({
  createScoringModel: vi.fn().mockReturnValue('mock-model'),
}));

// ---------- Import module under test ----------
import { scorerRoutes } from './scorers';

// ---------- Helpers ----------
function mountRoutes(routes: Record<string, unknown>[]) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    const method = (route.method as string).toLowerCase();
    // biome-ignore lint/suspicious/noExplicitAny: dynamic route mounting for tests
    (app as any).on(method, route.path as string, ...mid, route.handler);
  }
  return app;
}

function makeDefinitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'def-1',
    status: 'active',
    active_version_id: 'ver-1',
    author_id: null,
    metadata: null,
    created_at: '2026-04-20T10:00:00.000Z',
    updated_at: '2026-04-20T10:00:00.000Z',
    name: 'faithfulness',
    description: 'Are answers grounded in retrieved context?',
    type: 'faithfulness',
    model: null,
    instructions: null,
    score_range: null,
    preset_config: null,
    default_sampling: null,
    version_number: 1,
    change_message: 'Initial version',
    ...overrides,
  };
}

function makeVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-1',
    scorer_definition_id: 'def-1',
    version_number: 1,
    name: 'faithfulness',
    description: 'Are answers grounded in retrieved context?',
    type: 'faithfulness',
    model: null,
    instructions: null,
    score_range: null,
    preset_config: null,
    default_sampling: null,
    changed_fields: null,
    change_message: 'Initial version',
    created_at: '2026-04-20T10:00:00.000Z',
    ...overrides,
  };
}

// ---------- Tests ----------
describe('Scorer Routes', () => {
  let app: Hono;

  beforeEach(() => {
    mockSqlUnsafe.mockReset().mockResolvedValue([]);
    mockStorage.getById.mockReset().mockResolvedValue(null);
    mockStorage.create.mockReset().mockResolvedValue({ id: 'def-1', status: 'draft' });
    mockStorage.update.mockReset().mockResolvedValue({ id: 'def-1', status: 'active' });
    mockStorage.delete.mockReset().mockResolvedValue(undefined);
    mockStorage.createVersion.mockReset().mockResolvedValue({ id: 'ver-1', version_number: 1, name: 'test' });
    mockStorage.getVersion.mockReset().mockResolvedValue(null);
    mockStorage.getLatestVersion.mockReset().mockResolvedValue(null);
    mockStorage.listVersions.mockReset().mockResolvedValue({ rows: [], total: 0, hasMore: false });
    mockStorage.countVersions.mockReset().mockResolvedValue(0);
    mockConstructScorer.mockReset().mockReturnValue(null);
    app = mountRoutes(scorerRoutes as unknown as Record<string, unknown>[]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('route structure', () => {
    it('has 9 routes, all using requireAuth and requireAdmin', () => {
      expect(scorerRoutes).toHaveLength(9);
      for (const route of scorerRoutes as unknown as Record<string, unknown>[]) {
        const mid = route.middleware as Array<{ name: string }>;
        expect(mid).toHaveLength(2);
      }
    });
  });

  describe('GET /v1/admin/scorers', () => {
    it('returns scorer list with correct shape', async () => {
      const row = makeDefinitionRow();
      mockSqlUnsafe.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ count: 1 }]);

      const res = await app.request('/v1/admin/scorers');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.scorers).toHaveLength(1);
      expect(body.scorers[0].id).toBe('def-1');
      expect(body.scorers[0].name).toBe('faithfulness');
      expect(body.scorers[0].type).toBe('faithfulness');
      expect(body.scorers[0].status).toBe('active');
      expect(body.scorers[0].versionNumber).toBe(1);
      expect(body.total).toBe(1);
      expect(body.hasMore).toBe(false);
    });

    it('returns empty list when no scorers', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);

      const res = await app.request('/v1/admin/scorers');
      const body = await res.json();
      expect(body.scorers).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('POST /v1/admin/scorers', () => {
    it('creates definition + initial version, returns 201', async () => {
      const res = await app.request('/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'faithfulness', type: 'faithfulness', description: 'Test scorer' }),
      });

      expect(res.status).toBe(201);
      expect(mockStorage.create).toHaveBeenCalledOnce();
      expect(mockStorage.createVersion).toHaveBeenCalledOnce();

      const body = await res.json();
      expect(body.name).toBe('test'); // from mock return value
    });

    it('validates required fields', async () => {
      const res = await app.request('/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Missing name and type' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('name');
    });

    it('rejects missing type', async () => {
      const res = await app.request('/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('type');
    });
  });

  describe('GET /v1/admin/scorers/:id', () => {
    it('returns scorer with active version', async () => {
      const row = makeDefinitionRow();
      mockSqlUnsafe.mockResolvedValueOnce([row]);

      const res = await app.request('/v1/admin/scorers/def-1');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('def-1');
      expect(body.name).toBe('faithfulness');
    });

    it('returns 404 for unknown scorer', async () => {
      mockSqlUnsafe.mockResolvedValueOnce([]);

      const res = await app.request('/v1/admin/scorers/nonexistent');
      expect(res.status).toBe(404);
    });

    it('falls back to latest version when no active version', async () => {
      const row = makeDefinitionRow({ name: null, active_version_id: null });
      mockSqlUnsafe.mockResolvedValueOnce([row]);
      mockStorage.getLatestVersion.mockResolvedValueOnce(makeVersionRow({ name: 'fallback-name' }));

      const res = await app.request('/v1/admin/scorers/def-1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('fallback-name');
    });
  });

  describe('PATCH /v1/admin/scorers/:id', () => {
    it('updates scorer status', async () => {
      mockStorage.getById.mockResolvedValueOnce({ id: 'def-1', status: 'active' });
      mockStorage.update.mockResolvedValueOnce({ id: 'def-1', status: 'archived', updated_at: '2026-04-20T12:00:00Z' });

      const res = await app.request('/v1/admin/scorers/def-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      expect(res.status).toBe(200);
      expect(mockStorage.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'def-1', status: 'archived' }));
    });

    it('returns 404 for unknown scorer', async () => {
      const res = await app.request('/v1/admin/scorers/nonexistent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/scorers/:id', () => {
    it('deletes scorer', async () => {
      mockStorage.getById.mockResolvedValueOnce({ id: 'def-1' });

      const res = await app.request('/v1/admin/scorers/def-1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(mockStorage.delete).toHaveBeenCalledWith('def-1');
    });

    it('returns 404 for unknown scorer', async () => {
      const res = await app.request('/v1/admin/scorers/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/admin/scorers/:id/versions', () => {
    it('returns version history', async () => {
      mockStorage.listVersions.mockResolvedValueOnce({
        rows: [makeVersionRow(), makeVersionRow({ id: 'ver-2', version_number: 2 })],
        total: 2,
        hasMore: false,
      });

      const res = await app.request('/v1/admin/scorers/def-1/versions');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.versions).toHaveLength(2);
      expect(body.versions[0].versionNumber).toBe(1);
      expect(body.total).toBe(2);
    });
  });

  describe('POST /v1/admin/scorers/:id/versions', () => {
    it('creates new version with incremented number', async () => {
      mockStorage.getById.mockResolvedValueOnce({ id: 'def-1' });
      mockStorage.countVersions.mockResolvedValueOnce(2);
      mockStorage.createVersion.mockResolvedValueOnce(
        makeVersionRow({ id: 'ver-3', version_number: 3, change_message: 'Updated instructions' }),
      );

      const res = await app.request('/v1/admin/scorers/def-1/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'faithfulness',
          type: 'faithfulness',
          changeMessage: 'Updated instructions',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.versionNumber).toBe(3);
      expect(body.changeMessage).toBe('Updated instructions');
    });

    it('returns 404 for unknown scorer', async () => {
      const res = await app.request('/v1/admin/scorers/nonexistent/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', type: 'custom' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/admin/scorers/:id/publish', () => {
    it('publishes latest version when no versionId specified', async () => {
      mockStorage.getById.mockResolvedValueOnce({ id: 'def-1' });
      mockStorage.getLatestVersion.mockResolvedValueOnce({ id: 'ver-2' });
      mockStorage.update.mockResolvedValueOnce({
        id: 'def-1',
        status: 'active',
        active_version_id: 'ver-2',
      });

      const res = await app.request('/v1/admin/scorers/def-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(mockStorage.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'def-1', status: 'active', activeVersionId: 'ver-2' }),
      );
    });

    it('publishes specific version', async () => {
      mockStorage.getById.mockResolvedValueOnce({ id: 'def-1' });
      mockStorage.getVersion.mockResolvedValueOnce({ id: 'ver-1' });
      mockStorage.update.mockResolvedValueOnce({
        id: 'def-1',
        status: 'active',
        active_version_id: 'ver-1',
      });

      const res = await app.request('/v1/admin/scorers/def-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'ver-1' }),
      });

      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown scorer', async () => {
      const res = await app.request('/v1/admin/scorers/nonexistent/publish', { method: 'POST' });
      expect(res.status).toBe(404);
    });

    it('returns 404 for unknown version', async () => {
      mockStorage.getById.mockResolvedValueOnce({ id: 'def-1' });
      mockStorage.getVersion.mockResolvedValueOnce(null);

      const res = await app.request('/v1/admin/scorers/def-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 'nonexistent' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/admin/scorers/:id/preview', () => {
    it('runs scorer and returns score + reason', async () => {
      const mockScorer = {
        run: vi.fn().mockResolvedValue({ score: 0.85, reason: 'Well-grounded response' }),
      };
      mockConstructScorer.mockReturnValueOnce({ id: 'faithfulness', scorer: mockScorer });
      mockStorage.getLatestVersion.mockResolvedValueOnce(
        makeVersionRow({ name: 'faithfulness', type: 'faithfulness' }),
      );

      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: 'The answer is 42',
          context: ['The answer to everything is 42'],
          question: 'What is the answer?',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.score).toBe(0.85);
      expect(body.reason).toBe('Well-grounded response');
      expect(body.durationMs).toBeTypeOf('number');
    });

    it('validates required fields', async () => {
      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: ['some context'] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('required');
    });

    it('returns 404 when no version found', async () => {
      mockStorage.getLatestVersion.mockResolvedValueOnce(null);

      const res = await app.request('/v1/admin/scorers/def-1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'test', question: 'test', context: [] }),
      });

      expect(res.status).toBe(404);
    });
  });
});
