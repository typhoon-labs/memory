import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';

import { errorResponse } from '../lib/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getDatasetService } from '../services';

export const datasetRoutes = [
  // List datasets
  registerApiRoute('/v1/admin/datasets', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getDatasetService().list({
        page: Number(c.req.query('page') ?? '0'),
        perPage: Number(c.req.query('perPage') ?? '100'),
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Create dataset
  registerApiRoute('/v1/admin/datasets', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getDatasetService().create(body);
      if (isError(result)) return errorResponse(c, result);
      const data = result.data as Record<string, unknown> & { _status?: number };
      const { _status, ...rest } = data;
      return c.json(rest, 201);
    },
  }),

  // Get dataset by ID
  registerApiRoute('/v1/admin/datasets/:id', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getDatasetService().getById(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Update dataset
  registerApiRoute('/v1/admin/datasets/:id', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getDatasetService().update(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Delete dataset
  registerApiRoute('/v1/admin/datasets/:id', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getDatasetService().delete(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // List dataset items
  registerApiRoute('/v1/admin/datasets/:id/items', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getDatasetService().listItems(c.req.param('id'), {
        page: Number(c.req.query('page') ?? '0'),
        perPage: Number(c.req.query('perPage') ?? '100'),
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Add dataset items (single or batch)
  registerApiRoute('/v1/admin/datasets/:id/items', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getDatasetService().addItems(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      const data = result.data as Record<string, unknown> & { _status?: number };
      const { _status, ...rest } = data;
      return c.json(rest, 201);
    },
  }),

  // Update a dataset item
  registerApiRoute('/v1/admin/datasets/:id/items/:itemId', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      const result = await getDatasetService().updateItem(c.req.param('id'), c.req.param('itemId'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Delete a dataset item
  registerApiRoute('/v1/admin/datasets/:id/items/:itemId', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const result = await getDatasetService().deleteItem(c.req.param('id'), c.req.param('itemId'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
