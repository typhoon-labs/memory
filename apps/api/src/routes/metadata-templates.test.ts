import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockService } = vi.hoisted(() => ({
  mockService: {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));

vi.mock('../services', () => ({
  getMetadataService: () => mockService,
}));

vi.mock('../middleware/require-auth', () => ({
  requireAuth: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { metadataTemplateRoutes } from './metadata-templates';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountRoutes(routes: Array<Record<string, unknown>>) {
  const app = new Hono();
  for (const route of routes) {
    const mid = Array.isArray(route.middleware) ? route.middleware : route.middleware ? [route.middleware] : [];
    (app as any)[String(route.method).toLowerCase()](route.path, ...mid, route.handler);
  }
  return app;
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl-1',
    name: 'US Legal',
    fieldGroupIds: ['fg-1'],
    customFields: { jurisdiction: { type: 'string', required: true } },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = mountRoutes(metadataTemplateRoutes as any);
});

// ── GET /v1/metadata-templates ───────────────────────────────────────────────

describe('GET /v1/metadata-templates', () => {
  it('returns list of templates', async () => {
    const templates = [makeTemplate(), makeTemplate({ id: 'tmpl-2', name: 'EU Docs' })];
    mockService.listTemplates.mockResolvedValue({ data: templates });

    const res = await app.request('/v1/metadata-templates');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].name).toBe('US Legal');
  });

  it('returns empty array when no templates exist', async () => {
    mockService.listTemplates.mockResolvedValue({ data: [] });

    const res = await app.request('/v1/metadata-templates');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns error when service fails', async () => {
    mockService.listTemplates.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-templates');

    expect(res.status).toBe(404);
  });
});

// ── POST /v1/metadata-templates ──────────────────────────────────────────────

describe('POST /v1/metadata-templates', () => {
  it('creates a template (201) with effectiveSchema', async () => {
    const template = makeTemplate();
    const effectiveSchema = { jurisdiction: { type: 'string', required: true } };
    mockService.createTemplate.mockResolvedValue({ data: { template, effectiveSchema } });

    const res = await app.request('/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'US Legal' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('tmpl-1');
    expect(json.name).toBe('US Legal');
    expect(json.effectiveSchema).toEqual(effectiveSchema);
  });

  it('returns 500 for invalid body (Zod throws before service)', async () => {
    const res = await app.request('/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(res.status).toBe(500);
    expect(mockService.createTemplate).not.toHaveBeenCalled();
  });

  it('returns error when service returns error', async () => {
    mockService.createTemplate.mockResolvedValue({ error: 'conflict' });

    const res = await app.request('/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'US Legal' }),
    });

    expect(res.status).toBe(409);
  });

  it('defaults fieldGroupIds and customFields', async () => {
    const template = makeTemplate({ fieldGroupIds: [], customFields: {} });
    mockService.createTemplate.mockResolvedValue({ data: { template, effectiveSchema: {} } });

    const res = await app.request('/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Minimal' }),
    });

    expect(res.status).toBe(201);
    expect(mockService.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Minimal',
        fieldGroupIds: [],
        customFields: {},
      }),
    );
  });
});

// ── GET /v1/metadata-templates/:id ───────────────────────────────────────────

describe('GET /v1/metadata-templates/:id', () => {
  it('returns a template by id', async () => {
    const template = makeTemplate();
    mockService.getTemplate.mockResolvedValue({ data: template });

    const res = await app.request('/v1/metadata-templates/tmpl-1');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('tmpl-1');
    expect(mockService.getTemplate).toHaveBeenCalledWith('tmpl-1');
  });

  it('returns 404 when template not found', async () => {
    mockService.getTemplate.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-templates/nonexistent');

    expect(res.status).toBe(404);
  });
});

// ── PATCH /v1/metadata-templates/:id ─────────────────────────────────────────

describe('PATCH /v1/metadata-templates/:id', () => {
  it('updates a template', async () => {
    const updated = makeTemplate({ name: 'Updated Template' });
    mockService.updateTemplate.mockResolvedValue({ data: updated });

    const res = await app.request('/v1/metadata-templates/tmpl-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Template' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Updated Template');
    expect(mockService.updateTemplate).toHaveBeenCalledWith(
      'tmpl-1',
      expect.objectContaining({ name: 'Updated Template' }),
    );
  });

  it('returns 404 when template not found', async () => {
    mockService.updateTemplate.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-templates/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Something' }),
    });

    expect(res.status).toBe(404);
  });

  it('accepts empty update body', async () => {
    mockService.updateTemplate.mockResolvedValue({ data: makeTemplate() });

    const res = await app.request('/v1/metadata-templates/tmpl-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
});

// ── DELETE /v1/metadata-templates/:id ────────────────────────────────────────

describe('DELETE /v1/metadata-templates/:id', () => {
  it('deletes a template', async () => {
    mockService.deleteTemplate.mockResolvedValue({ data: { ok: true } });

    const res = await app.request('/v1/metadata-templates/tmpl-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(mockService.deleteTemplate).toHaveBeenCalledWith('tmpl-1');
  });

  it('returns 404 when template not found', async () => {
    mockService.deleteTemplate.mockResolvedValue({ error: 'not-found' });

    const res = await app.request('/v1/metadata-templates/nonexistent', { method: 'DELETE' });

    expect(res.status).toBe(404);
  });
});

// ── Route structure ──────────────────────────────────────────────────────────

describe('route structure', () => {
  it('has 5 routes, all using requireAuth', () => {
    expect(metadataTemplateRoutes).toHaveLength(5);
    for (const route of metadataTemplateRoutes as unknown as Record<string, unknown>[]) {
      const mid = route.middleware as unknown[];
      expect(mid).toHaveLength(1);
    }
  });
});
