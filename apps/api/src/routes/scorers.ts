import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';

import { errorResponse } from '../lib/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getScorerService } from '../services';

export const scorerRoutes = [
  // Available models for scorer selection
  registerApiRoute('/v1/admin/scorers/models', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = getScorerService().getModels();
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // List scorer definitions with active version info
  registerApiRoute('/v1/admin/scorers', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getScorerService().list({
        page: Number(c.req.query('page') ?? '0'),
        perPage: Number(c.req.query('perPage') ?? '100'),
        status: c.req.query('status'),
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Create new scorer definition + initial version
  registerApiRoute('/v1/admin/scorers', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getScorerService().create(body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data, 201);
    },
  }),

  // Get scorer definition with active version
  registerApiRoute('/v1/admin/scorers/:id', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getScorerService().getById(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Update scorer definition status
  registerApiRoute('/v1/admin/scorers/:id', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getScorerService().update(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Delete scorer definition
  registerApiRoute('/v1/admin/scorers/:id', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getScorerService().delete(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // List version history for a scorer
  registerApiRoute('/v1/admin/scorers/:id/versions', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getScorerService().listVersions(c.req.param('id'), {
        page: Number(c.req.query('page') ?? '0'),
        perPage: Number(c.req.query('perPage') ?? '100'),
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Create a new version
  registerApiRoute('/v1/admin/scorers/:id/versions', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getScorerService().createVersion(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data, 201);
    },
  }),

  // Publish a version (set as active)
  registerApiRoute('/v1/admin/scorers/:id/publish', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const result = await getScorerService().publishVersion(
        c.req.param('id'),
        (body as Record<string, unknown>).versionId as string | undefined,
      );
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Preview — test a scorer against sample data
  registerApiRoute('/v1/admin/scorers/:id/preview', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const { createScoringModel } = await import('@typhoon/ai');
      const result = await getScorerService().previewScore(c.req.param('id'), body, createScoringModel);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
