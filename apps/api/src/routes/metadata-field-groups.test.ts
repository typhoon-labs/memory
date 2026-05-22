import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockService } = vi.hoisted(() => ({
  mockService: {
    listFieldGroups: vi.fn(),
    getFieldGroup: vi.fn(),
    createFieldGroup: vi.fn(),
    updateFieldGroup: vi.fn(),
    deleteFieldGroup: vi.fn(),
  },
}));

vi.mock('../services', () => ({
  getMetadataService: () => mockService,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { metadataFieldGroupRoutes } from './metadata-field-groups';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountRoutes(routes: Array<Record<string, unknown>>) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[String(route.method).toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeFieldGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fg-1',
    name: 'Region',
    fields: { country: { type: 'string', required: true } },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = mountRoutes(metadataFieldGroupRoutes as any);
});

// ── GET /v1/metadata-field-groups ────────────────────────────────────────────

describe('GET /v1/metadata-field-groups', () => {
  it('returns list of field groups', async () => {
    const groups = [makeFieldGroup(), makeFieldGroup({ id: 'fg-2', name: 'Product' })];
    mockService.listFieldGroups.mockResolvedValue({ data: groups });

    const res = await app.request('/v1/metadata-field-groups');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].name).toBe('Region');
  });

  it('returns empty array when no groups exist', async () => {
    mockService.listFieldGroups.mockResolvedValue({ data: [] });

    const res = await app.request('/v1/metadata-field-groups');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns error when service fails', async () => {
    mockService.listFieldGroups.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-field-groups');

    expect(res.status).toBe(404);
  });
});

// ── POST /v1/metadata-field-groups ───────────────────────────────────────────

describe('POST /v1/metadata-field-groups', () => {
  it('creates a field group (201)', async () => {
    const group = makeFieldGroup();
    mockService.createFieldGroup.mockResolvedValue({ data: { group } });

    const res = await app.request('/v1/metadata-field-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Region', fields: { country: { type: 'string' } } }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('fg-1');
    expect(json.name).toBe('Region');
    expect(mockService.createFieldGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Region' }));
  });

  it('returns 500 for invalid body (Zod throws before service)', async () => {
    const res = await app.request('/v1/metadata-field-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', fields: {} }),
    });

    expect(res.status).toBe(500);
    expect(mockService.createFieldGroup).not.toHaveBeenCalled();
  });

  it('returns error when service returns error', async () => {
    mockService.createFieldGroup.mockResolvedValue({ error: 'conflict' });

    const res = await app.request('/v1/metadata-field-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Region', fields: {} }),
    });

    expect(res.status).toBe(409);
  });
});

// ── GET /v1/metadata-field-groups/:id ────────────────────────────────────────

describe('GET /v1/metadata-field-groups/:id', () => {
  it('returns a field group by id', async () => {
    const group = makeFieldGroup();
    mockService.getFieldGroup.mockResolvedValue({ data: group });

    const res = await app.request('/v1/metadata-field-groups/fg-1');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('fg-1');
    expect(mockService.getFieldGroup).toHaveBeenCalledWith('fg-1');
  });

  it('returns 404 when group not found', async () => {
    mockService.getFieldGroup.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-field-groups/nonexistent');

    expect(res.status).toBe(404);
  });
});

// ── PATCH /v1/metadata-field-groups/:id ──────────────────────────────────────

describe('PATCH /v1/metadata-field-groups/:id', () => {
  it('updates a field group', async () => {
    const updated = makeFieldGroup({ name: 'Updated Region' });
    mockService.updateFieldGroup.mockResolvedValue({ data: updated });

    const res = await app.request('/v1/metadata-field-groups/fg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Region' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Updated Region');
    expect(mockService.updateFieldGroup).toHaveBeenCalledWith(
      'fg-1',
      expect.objectContaining({ name: 'Updated Region' }),
    );
  });

  it('returns 404 when group not found', async () => {
    mockService.updateFieldGroup.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-field-groups/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Something' }),
    });

    expect(res.status).toBe(404);
  });

  it('accepts empty update body', async () => {
    mockService.updateFieldGroup.mockResolvedValue({ data: makeFieldGroup() });

    const res = await app.request('/v1/metadata-field-groups/fg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
});

// ── DELETE /v1/metadata-field-groups/:id ──────────────────────────────────────

describe('DELETE /v1/metadata-field-groups/:id', () => {
  it('deletes a field group', async () => {
    mockService.deleteFieldGroup.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/metadata-field-groups/fg-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(mockService.deleteFieldGroup).toHaveBeenCalledWith('fg-1');
  });

  it('returns 404 when group not found', async () => {
    mockService.deleteFieldGroup.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-field-groups/nonexistent', { method: 'DELETE' });

    expect(res.status).toBe(404);
  });
});

// ── Route structure ──────────────────────────────────────────────────────────

describe('route structure', () => {
  it('has 5 routes, all using requireAuth', () => {
    expect(metadataFieldGroupRoutes).toHaveLength(5);
    for (const route of metadataFieldGroupRoutes as unknown as Record<string, unknown>[]) {
      const mid = route.middleware as unknown[];
      expect(mid).toHaveLength(1);
    }
  });
});
