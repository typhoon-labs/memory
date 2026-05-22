import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { z } from 'zod';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getSyncTargetService } from '../services';

const createSyncTargetSchema = z.object({
  name: z.string().min(1),
  sourceType: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  cronSchedule: z.string().optional(),
  isActive: z.boolean().optional(),
  source: z.string().optional(),
  metadataTemplateId: z.string().uuid().nullable().optional(),
  autoExtractMetadata: z.boolean().optional(),
});

const updateSyncTargetSchema = createSyncTargetSchema.partial();

export const syncTargetRoutes = [
  registerApiRoute('/v1/sources', {
    method: 'GET',
    middleware: [requireAuth],
    handler: (c) => {
      const svc = getSyncTargetService();
      return c.json(svc.listSources());
    },
  }),

  registerApiRoute('/v1/sync-targets', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const result = await svc.list();
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = createSyncTargetSchema.parse(await c.req.json());
      const result = await svc.create(body);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data.target, 201);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const result = await svc.getById(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = updateSyncTargetSchema.parse(await c.req.json());
      const result = await svc.update(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const result = await svc.delete(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/sync', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = await c.req.json().catch(() => ({}));
      const force = body.force === true;
      const result = await svc.sync(c.req.param('id'), force);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/purge', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const result = await svc.purge(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/refresh-search-index', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const result = await svc.refreshSearchIndex(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/jobs', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const result = await svc.listJobs(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  // ── Upload files (S3 only) ────────────────────────────────────
  registerApiRoute('/v1/sync-targets/:id/upload', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = await c.req.parseBody({ all: true });
      const rawFiles = Array.isArray(body.files) ? body.files : body.files ? [body.files] : [];
      const validFiles = rawFiles.filter((f): f is File => f instanceof File);

      const files = await Promise.all(
        validFiles.map(async (f) => ({
          name: f.name,
          content: Buffer.from(await f.arrayBuffer()),
          size: f.size,
          type: f.type || '',
        })),
      );

      const subPath = typeof body.path === 'string' ? body.path : undefined;
      const result = await svc.upload(c.req.param('id'), files, subPath);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data.docs, 201);
    },
  }),

  // ── Browse files at a prefix (S3 only) ────────────────────────
  registerApiRoute('/v1/sync-targets/:id/browse', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const path = c.req.query('path') ?? '';
      const result = await svc.browse(c.req.param('id'), path);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  // ── Create folder (S3 only) ───────────────────────────────────
  registerApiRoute('/v1/sync-targets/:id/folders', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = z.object({ path: z.string().min(1) }).parse(await c.req.json());
      const result = await svc.createFolder(c.req.param('id'), body.path);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  // ── Delete folder and contents (S3 only) ──────────────────────
  registerApiRoute('/v1/sync-targets/:id/folders/delete', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = z.object({ path: z.string().min(1) }).parse(await c.req.json());
      const result = await svc.deleteFolder(c.req.param('id'), body.path);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  // ── Move/rename folder (S3 only) ──────────────────────────────
  registerApiRoute('/v1/sync-targets/:id/folders/move', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const svc = getSyncTargetService();
      const body = z.object({ oldPath: z.string().min(1), newPath: z.string().min(1) }).parse(await c.req.json());
      const result = await svc.moveFolder(c.req.param('id'), body.oldPath, body.newPath);
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),
];
