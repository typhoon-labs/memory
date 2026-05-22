import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';

import { errorResponse } from '../lib/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getExperimentService } from '../services';

export const experimentRoutes = [
  // List experiments
  registerApiRoute('/v1/admin/experiments', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getExperimentService().list({
        page: Number(c.req.query('page') ?? '0'),
        perPage: Number(c.req.query('perPage') ?? '100'),
        status: c.req.query('status'),
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Create experiment and enqueue job
  registerApiRoute('/v1/admin/experiments', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getExperimentService().create(body);
      if (isError(result)) return errorResponse(c, result);
      const data = result.data as Record<string, unknown> & { _status?: number };
      const { _status, ...rest } = data;
      return c.json(rest, 201);
    },
  }),

  // Compare two experiments — must be before /:id routes to avoid path conflict
  registerApiRoute('/v1/admin/experiments/compare', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const idA = c.req.query('a');
      const idB = c.req.query('b');
      if (!idA || !idB) {
        return c.json({ error: 'Both query params "a" and "b" (experiment IDs) are required' }, 400);
      }
      const result = await getExperimentService().compare(idA, idB);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Get experiment by ID
  registerApiRoute('/v1/admin/experiments/:id', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getExperimentService().getById(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Cancel or delete experiment
  registerApiRoute('/v1/admin/experiments/:id', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getExperimentService().delete(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Get experiment results
  registerApiRoute('/v1/admin/experiments/:id/results', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getExperimentService().getResults(c.req.param('id'), {
        page: Number(c.req.query('page') ?? '0'),
        perPage: Number(c.req.query('perPage') ?? '100'),
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
