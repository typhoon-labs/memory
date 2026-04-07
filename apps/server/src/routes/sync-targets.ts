import { registerApiRoute } from '@mastra/core/server';
import { documents, syncJobs, syncTargets } from '@typhoon/db';
import type { ProcessFileJobData, ScanJobData } from '@typhoon/ingestion';
import { deleteDocumentVectors, getProvider, listSources, updateDocumentVectorSource } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { PgVector } from '@typhoon/pg';
import { syncTargetConfigSchemas } from '@typhoon/types';
import { and, eq, inArray, like, ne } from 'drizzle-orm';
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
  registerApiRoute('/v1/sources', {
    method: 'GET',
    middleware: [requireAuth],
    handler: (c) => {
      const sources = listSources().map(({ name, sourceType }) => ({ name, sourceType }));
      return c.json(sources);
    },
  }),

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

      // Delete vectors before cascade removes document rows
      const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.syncTargetId, id));
      for (const doc of docs) {
        await deleteDocumentVectors(vectorStore, doc.id);
      }

      await db.delete(syncTargets).where(eq(syncTargets.id, id));
      log.info('Sync target deleted', { id, documentsCleared: docs.length });
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
      const body = await c.req.json().catch(() => ({}));
      const force = body.force === true;
      const syncQueue = getSyncQueue();
      await syncQueue.add('scan', { syncTargetId: id, force } satisfies ScanJobData);
      log.info('Manual sync triggered — scan job enqueued', { id, name: target.name, force });
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

      const docs = await db
        .select({ id: documents.id, sourceKey: documents.sourceKey })
        .from(documents)
        .where(and(eq(documents.syncTargetId, id), ne(documents.status, 'deleted')));

      if (docs.length === 0) {
        return c.json({ ok: true, purged: 0 });
      }

      for (const doc of docs) {
        await deleteDocumentVectors(vectorStore, doc.id);
      }

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

  // ── Upload files (S3 only) ────────────────────────────────────
  registerApiRoute('/v1/sync-targets/:id/upload', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);

      const provider = getProvider(target.sourceType);
      if (!provider.upload) {
        return c.json({ error: 'Upload is not supported for this source type' }, 400);
      }

      const body = await c.req.parseBody({ all: true });
      const files = Array.isArray(body.files) ? body.files : body.files ? [body.files] : [];
      const validFiles = files.filter((f): f is File => f instanceof File);

      if (validFiles.length === 0) {
        return c.json({ error: 'No files provided' }, 400);
      }

      const config = target.config as Record<string, unknown>;
      const s3Config = config as { prefix?: string };
      const basePrefix = s3Config.prefix
        ? s3Config.prefix.endsWith('/')
          ? s3Config.prefix
          : `${s3Config.prefix}/`
        : '';
      const rawSubPath = typeof body.path === 'string' ? body.path.trim().replace(/^\/+|\/+$/g, '') : '';
      const subPath = rawSubPath ? `${rawSubPath}/` : '';
      const fullPrefix = `${basePrefix}${subPath}`;

      const sourceName = target.source ?? undefined;
      const syncQueue = getSyncQueue();
      const created = [];

      for (const file of validFiles) {
        const sourceKey = `${fullPrefix}${file.name}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        await provider.upload(config, sourceKey, buffer, file.type || undefined, sourceName);

        const [doc] = await db
          .insert(documents)
          .values({
            syncTargetId: id,
            sourceKey,
            sourceEtag: '',
            fileSize: file.size,
            mimeType: file.type || null,
            status: 'processing',
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [documents.syncTargetId, documents.sourceKey],
            set: {
              status: 'processing',
              errorMessage: null,
              fileSize: file.size,
              mimeType: file.type || null,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            },
          })
          .returning();

        const isUpdate = doc.createdAt.getTime() !== doc.updatedAt.getTime();

        await syncQueue.add('process-file', {
          syncTargetId: id,
          documentId: doc.id,
          sourceKey,
          sourceEtag: '',
          sourceType: target.sourceType,
          sourceName,
          isUpdate,
        } satisfies ProcessFileJobData);

        created.push(doc);
      }

      log.info('Files uploaded', { syncTargetId: id, count: created.length });
      return c.json(created, 201);
    },
  }),

  // ── Browse files at a prefix (S3 only) ────────────────────────
  registerApiRoute('/v1/sync-targets/:id/browse', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const path = c.req.query('path') ?? '';

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);

      const provider = getProvider(target.sourceType);
      if (!provider.browse) {
        return c.json({ error: 'Browse is not supported for this source type' }, 400);
      }

      const config = target.config as Record<string, unknown>;
      const sourceName = target.source ?? undefined;
      const result = await provider.browse(config, path, sourceName);

      // Enrich files with DB document info
      const sourceKeys = result.objects.map((o) => o.key);
      const dbDocs =
        sourceKeys.length > 0
          ? await db
              .select()
              .from(documents)
              .where(and(eq(documents.syncTargetId, id), inArray(documents.sourceKey, sourceKeys)))
          : [];
      const docByKey = new Map(dbDocs.map((d) => [d.sourceKey, d]));

      const files = result.objects.map((obj) => {
        const doc = docByKey.get(obj.key);
        return {
          sourceKey: obj.key,
          size: obj.size,
          lastModified: obj.lastModified,
          document: doc ?? null,
        };
      });

      return c.json({ path, folders: result.folders, files });
    },
  }),

  // ── Create folder (S3 only) ───────────────────────────────────
  registerApiRoute('/v1/sync-targets/:id/folders', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = z.object({ path: z.string().min(1) }).parse(await c.req.json());

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);

      const provider = getProvider(target.sourceType);
      if (!provider.createFolder) {
        return c.json({ error: 'Folder creation is not supported for this source type' }, 400);
      }

      const config = target.config as Record<string, unknown>;
      const s3Config = config as { prefix?: string };
      const basePrefix = s3Config.prefix
        ? s3Config.prefix.endsWith('/')
          ? s3Config.prefix
          : `${s3Config.prefix}/`
        : '';
      const fullPath = `${basePrefix}${body.path}`;

      await provider.createFolder(config, fullPath, target.source ?? undefined);

      return c.json({ ok: true, path: body.path });
    },
  }),

  // ── Delete folder and contents (S3 only) ──────────────────────
  registerApiRoute('/v1/sync-targets/:id/folders/delete', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = z.object({ path: z.string().min(1) }).parse(await c.req.json());

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);

      const provider = getProvider(target.sourceType);
      if (!provider.deleteObject) {
        return c.json({ error: 'Folder deletion is not supported for this source type' }, 400);
      }

      const config = target.config as Record<string, unknown>;
      const s3Config = config as { prefix?: string };
      const basePrefix = s3Config.prefix
        ? s3Config.prefix.endsWith('/')
          ? s3Config.prefix
          : `${s3Config.prefix}/`
        : '';
      const fullPrefix = `${basePrefix}${body.path}`;
      const sourceName = target.source ?? undefined;

      // Find all documents under this prefix
      const docs = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.syncTargetId, id),
            like(documents.sourceKey, `${fullPrefix}%`),
            ne(documents.status, 'deleted'),
          ),
        );

      // Delete vectors and source objects for each document
      for (const doc of docs) {
        await deleteDocumentVectors(vectorStore, doc.id);
        try {
          await provider.deleteObject(config, doc.sourceKey, sourceName);
        } catch {
          // Best-effort
        }
      }

      if (docs.length > 0) {
        const docIds = docs.map((d) => d.id);
        await db
          .update(documents)
          .set({ status: 'deleted', updatedAt: new Date() })
          .where(inArray(documents.id, docIds));
      }

      // Delete the folder placeholder itself
      try {
        const folderKey = fullPrefix.endsWith('/') ? fullPrefix : `${fullPrefix}/`;
        await provider.deleteObject(config, folderKey, sourceName);
      } catch {
        // Folder placeholder may not exist
      }

      return c.json({ ok: true, deleted: docs.length });
    },
  }),

  // ── Move/rename folder (S3 only) ──────────────────────────────
  registerApiRoute('/v1/sync-targets/:id/folders/move', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = z.object({ oldPath: z.string().min(1), newPath: z.string().min(1) }).parse(await c.req.json());

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, id));
      if (!target) return c.json({ error: 'Not found' }, 404);

      const provider = getProvider(target.sourceType);
      if (!provider.copyObject || !provider.deleteObject) {
        return c.json({ error: 'Folder move is not supported for this source type' }, 400);
      }

      const config = target.config as Record<string, unknown>;
      const s3Config = config as { prefix?: string };
      const basePrefix = s3Config.prefix
        ? s3Config.prefix.endsWith('/')
          ? s3Config.prefix
          : `${s3Config.prefix}/`
        : '';
      const oldPrefix = `${basePrefix}${body.oldPath}`;
      const newPrefix = `${basePrefix}${body.newPath}`;
      const sourceName = target.source ?? undefined;

      // List all source objects under old prefix
      const allObjects = await provider.listObjects(config, sourceName);
      const objectsToMove = allObjects.filter((o) => o.key.startsWith(oldPrefix));

      let moved = 0;
      for (const obj of objectsToMove) {
        const newKey = `${newPrefix}${obj.key.slice(oldPrefix.length)}`;

        await provider.copyObject(config, obj.key, newKey, sourceName);
        await provider.deleteObject(config, obj.key, sourceName);

        // Update DB document if it exists
        const [doc] = await db
          .update(documents)
          .set({ sourceKey: newKey, updatedAt: new Date() })
          .where(and(eq(documents.syncTargetId, id), eq(documents.sourceKey, obj.key)))
          .returning();

        if (doc) {
          await updateDocumentVectorSource(sql, doc.id, newKey);
        }

        moved++;
      }

      return c.json({ ok: true, moved });
    },
  }),
];
