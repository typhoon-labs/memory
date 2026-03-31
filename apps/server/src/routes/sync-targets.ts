import { registerApiRoute } from '@mastra/core/server';
import { documents, syncJobs, syncTargets } from '@typhoon/db';
import type { ScanJobData } from '@typhoon/ingestion';
import { deleteDocumentVectors } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { PgVector } from '@typhoon/pg';
import { syncTargetConfigSchemas } from '@typhoon/types';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, sql } from '../db.js';
import { requireAuth } from '../middleware/require-auth.js';
import { getSyncQueue } from '../queue.js';
import { refreshScheduler } from '../scheduler.js';

const log = createAppLogger('sync-targets');

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

const createSyncTargetSchema = z.object({
  name: z.string().min(1),
  sourceType: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  cronSchedule: z.string().optional(),
  isActive: z.boolean().optional(),
  source: z.string().optional(),
});

const updateSyncTargetSchema = createSyncTargetSchema.partial();

export const syncTargetRoutes = [
  registerApiRoute('/v1/sync-targets', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const targets = await db.select().from(syncTargets);
      return c.json(targets);
    },
  }),

  registerApiRoute('/v1/sync-targets', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = createSyncTargetSchema.parse(await c.req.json());
      const configSchema = syncTargetConfigSchemas[body.sourceType];
      if (configSchema) {
        const result = configSchema.safeParse(body.config);
        if (!result.success) {
          const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
          return c.json({ error: `Invalid config: ${issues}` }, 400);
        }
      }
      const [target] = await db.insert(syncTargets).values(body).returning();
      log.info('Sync target created', { id: target.id, name: body.name });
      await refreshScheduler();
      return c.json(target, 201);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);
      return c.json(target);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);
      if (target.managedBy === 'config') {
        log.warn('Attempt to modify config-managed target', { id });
        return c.json({ error: 'Cannot edit config-managed sync target' }, 403);
      }
      const body = updateSyncTargetSchema.parse(await c.req.json());
      const [updated] = await db
        .update(syncTargets)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(syncTargets.id, id))
        .returning();
      await refreshScheduler();
      return c.json(updated);
    },
  }),

  registerApiRoute('/v1/sync-targets/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);
      if (target.managedBy === 'config') {
        log.warn('Attempt to delete config-managed target', { id });
        return c.json({ error: 'Cannot delete config-managed sync target' }, 403);
      }
      await db.delete(syncTargets).where(eq(syncTargets.id, id));
      log.info('Sync target deleted', { id });
      await refreshScheduler();
      return c.json({ ok: true });
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/sync', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);
      if (!target.isActive) return c.json({ error: 'Sync target is inactive' }, 400);
      const syncQueue = getSyncQueue();
      await syncQueue.add('scan', { syncTargetId: id } satisfies ScanJobData);
      log.info('Manual sync triggered — scan job enqueued', { id, name: target.name });
      return c.json({ ok: true, message: `Sync triggered for ${target.name}` });
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/purge', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);

      // Find all non-deleted documents for this target
      const docs = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.syncTargetId, id), ne(documents.status, 'deleted')));

      if (docs.length === 0) {
        return c.json({ ok: true, purged: 0 });
      }

      // Delete vectors for each document
      for (const doc of docs) {
        await deleteDocumentVectors(vectorStore, doc.id);
      }

      // Batch-mark all documents as deleted
      const docIds = docs.map((d) => d.id);
      await db.update(documents).set({ status: 'deleted', updatedAt: new Date() }).where(inArray(documents.id, docIds));

      log.info('Purge completed', { id, purged: docs.length });
      return c.json({ ok: true, purged: docs.length });
    },
  }),

  registerApiRoute('/v1/sync-targets/:id/jobs', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const jobs = await db.select().from(syncJobs).where(eq(syncJobs.syncTargetId, id));
      return c.json(jobs);
    },
  }),
];
