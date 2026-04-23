import { registerApiRoute } from '@mastra/core/server';
import { DrizzleDatasetsStorage } from '@typhoon/db/drivers/pg';
import { db } from '../db';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';

const datasetsStorage = new DrizzleDatasetsStorage(db);

export const datasetRoutes = [
  // List datasets
  registerApiRoute('/v1/admin/datasets', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const page = Number(c.req.query('page') ?? '0');
      const perPage = Math.min(Number(c.req.query('perPage') ?? '100'), 100);
      const result = await datasetsStorage.listDatasets({ page, perPage });
      return c.json(result);
    },
  }),

  // Create dataset
  registerApiRoute('/v1/admin/datasets', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const body = await c.req.json();
      if (!body.name || typeof body.name !== 'string') {
        return c.json({ error: 'name is required' }, 400);
      }
      const dataset = await datasetsStorage.createDataset({
        name: body.name,
        description: body.description ?? null,
        metadata: body.metadata ?? null,
      });
      return c.json(dataset, 201);
    },
  }),

  // Get dataset by ID
  registerApiRoute('/v1/admin/datasets/:id', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const dataset = await datasetsStorage.getDatasetById({ id });
      if (!dataset) return c.json({ error: 'Dataset not found' }, 404);
      return c.json(dataset);
    },
  }),

  // Update dataset
  registerApiRoute('/v1/admin/datasets/:id', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = await c.req.json();
      const existing = await datasetsStorage.getDatasetById({ id });
      if (!existing) return c.json({ error: 'Dataset not found' }, 404);
      const updated = await datasetsStorage._doUpdateDataset({ id, ...body });
      return c.json(updated);
    },
  }),

  // Delete dataset
  registerApiRoute('/v1/admin/datasets/:id', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const id = c.req.param('id');
      const existing = await datasetsStorage.getDatasetById({ id });
      if (!existing) return c.json({ error: 'Dataset not found' }, 404);
      await datasetsStorage.deleteDataset({ id });
      return c.json({ ok: true });
    },
  }),

  // List dataset items
  registerApiRoute('/v1/admin/datasets/:id/items', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const datasetId = c.req.param('id');
      const page = Number(c.req.query('page') ?? '0');
      const perPage = Math.min(Number(c.req.query('perPage') ?? '100'), 100);
      const result = await datasetsStorage.listItems({ datasetId, page, perPage });
      return c.json(result);
    },
  }),

  // Add dataset items (single or batch)
  registerApiRoute('/v1/admin/datasets/:id/items', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const datasetId = c.req.param('id');
      const body = await c.req.json();

      // Validate dataset exists
      const dataset = await datasetsStorage.getDatasetById({ id: datasetId });
      if (!dataset) return c.json({ error: 'Dataset not found' }, 404);

      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const version = (dataset as any).version ?? 0;

      // Batch mode: body.items is an array
      if (Array.isArray(body.items)) {
        const result = await datasetsStorage._doBatchInsertItems({
          datasetId,
          datasetVersion: version,
          items: body.items,
        });
        return c.json({ items: result }, 201);
      }

      // Single item mode
      if (!body.input) {
        return c.json({ error: 'input is required' }, 400);
      }
      const item = await datasetsStorage._doAddItem({
        datasetId,
        datasetVersion: version,
        input: body.input,
        groundTruth: body.groundTruth ?? null,
        requestContext: body.requestContext ?? null,
        metadata: body.metadata ?? null,
      });
      return c.json(item, 201);
    },
  }),

  // Update a dataset item
  registerApiRoute('/v1/admin/datasets/:id/items/:itemId', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const datasetId = c.req.param('id');
      const itemId = c.req.param('itemId');
      const body = await c.req.json();

      const dataset = await datasetsStorage.getDatasetById({ id: datasetId });
      if (!dataset) return c.json({ error: 'Dataset not found' }, 404);

      // biome-ignore lint/suspicious/noExplicitAny: storage returns untyped
      const version = (dataset as any).version ?? 0;

      const updated = await datasetsStorage._doUpdateItem({
        id: itemId,
        datasetVersion: version,
        ...(body.input !== undefined ? { input: body.input } : {}),
        ...(body.groundTruth !== undefined ? { groundTruth: body.groundTruth } : {}),
      });
      return c.json(updated);
    },
  }),

  // Delete a dataset item
  registerApiRoute('/v1/admin/datasets/:id/items/:itemId', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const datasetId = c.req.param('id');
      const itemId = c.req.param('itemId');
      await datasetsStorage._doDeleteItem({ id: itemId, datasetId });
      return c.json({ ok: true });
    },
  }),
];
