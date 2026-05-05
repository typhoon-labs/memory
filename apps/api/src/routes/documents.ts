import { registerApiRoute } from '@mastra/core/server';
import { documents, syncTargets } from '@typhoon/db';
import { PgVector } from '@typhoon/db/drivers/pg';
import {
  deleteDocumentVectors,
  getParser,
  getProvider,
  needsCustomParser,
  updateDocumentVectorSource,
} from '@typhoon/ingestion';
import type { ProcessFileJobData } from '@typhoon/queue';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, sql } from '../db';
import { requireAuth } from '../middleware/require-auth';
import { getSyncQueue } from '../queue';

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

export const documentRoutes = [
  registerApiRoute('/v1/documents', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const syncTargetId = c.req.query('syncTargetId');
      const query = db.select().from(documents);
      const docs = syncTargetId ? await query.where(eq(documents.syncTargetId, syncTargetId)) : await query;
      return c.json(docs);
    },
  }),

  registerApiRoute('/v1/documents/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);
      return c.json(doc);
    },
  }),

  registerApiRoute('/v1/documents/:id/chunks', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');

      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const chunkRows = await vectorStore.getChunksByDocumentId('knowledge_base', id);

      const chunks = chunkRows.map((row) => ({
        text: row.metadata.text ?? '',
        startIndex: row.metadata.startIndex ?? null,
      }));

      return c.json({ document: doc, chunks });
    },
  }),

  registerApiRoute('/v1/documents/:id/parsed-content', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      // If client has a cached version matching the current content hash, skip S3 download
      const clientEtag = c.req.header('If-None-Match');
      if (doc.contentHash && clientEtag === doc.contentHash) {
        return new Response(null, { status: 304 });
      }

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, doc.syncTargetId));
      if (!target) return c.json({ error: 'Sync target not found' }, 404);

      const provider = getProvider(target.sourceType);
      const config = target.config as Record<string, unknown>;
      const content = await provider.download(config, doc.sourceKey, target.source ?? undefined);

      let text: string;
      if (needsCustomParser(doc.sourceKey)) {
        const parser = getParser(doc.sourceKey);
        if (!parser) return c.json({ error: 'No parser available' }, 400);
        const result = await parser(Buffer.from(content), doc.sourceKey);
        text = result.text;
      } else {
        text = Buffer.from(content).toString('utf-8');
      }

      return c.json({ text }, 200, {
        'Cache-Control': 'private, max-age=300',
        ...(doc.contentHash && { ETag: doc.contentHash }),
      });
    },
  }),

  registerApiRoute('/v1/documents/:id/download', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, doc.syncTargetId));
      if (!target) return c.json({ error: 'Sync target not found' }, 404);

      const provider = getProvider(target.sourceType);
      const config = target.config as Record<string, unknown>;
      const content = await provider.download(config, doc.sourceKey, target.source ?? undefined);
      const filename = doc.sourceKey.split('/').pop() ?? 'download';

      return new Response(content.buffer as ArrayBuffer, {
        headers: {
          'Content-Type': doc.mimeType ?? 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(content.byteLength),
        },
      });
    },
  }),

  registerApiRoute('/v1/documents/:id/retry', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      if (doc.status !== 'parse_error' && doc.status !== 'embed_error') {
        return c.json({ error: 'Document is not in an error state' }, 400);
      }

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, doc.syncTargetId));
      if (!target) return c.json({ error: 'Sync target not found' }, 404);

      const [updated] = await db
        .update(documents)
        .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .returning();

      const syncQueue = getSyncQueue();
      await syncQueue.add('process-file', {
        syncTargetId: doc.syncTargetId,
        documentId: doc.id,
        sourceKey: doc.sourceKey,
        sourceEtag: doc.sourceEtag ?? '',
        sourceType: target.sourceType,
        sourceName: target.source ?? undefined,
        isUpdate: true,
      } satisfies ProcessFileJobData);

      return c.json(updated);
    },
  }),

  // ── Force re-sync a single document ───────────────────────────
  // Like /retry but without the error-status gate. Re-fetches the
  // file from its source, re-parses, re-chunks, and re-embeds.
  registerApiRoute('/v1/documents/:id/resync', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      if (doc.status === 'deleted') {
        return c.json({ error: 'Cannot re-sync a deleted document' }, 400);
      }
      if (doc.status === 'processing' || doc.status === 'pending') {
        return c.json({ error: 'Document is already being processed' }, 409);
      }

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, doc.syncTargetId));
      if (!target) return c.json({ error: 'Sync target not found' }, 404);

      const [updated] = await db
        .update(documents)
        .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .returning();

      const syncQueue = getSyncQueue();
      await syncQueue.add('process-file', {
        syncTargetId: doc.syncTargetId,
        documentId: doc.id,
        sourceKey: doc.sourceKey,
        sourceEtag: doc.sourceEtag ?? '',
        sourceType: target.sourceType,
        sourceName: target.source ?? undefined,
        isUpdate: true,
      } satisfies ProcessFileJobData);

      return c.json(updated);
    },
  }),

  // ── Delete single document ────────────────────────────────────
  registerApiRoute('/v1/documents/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, doc.syncTargetId));

      // Delete vectors
      await deleteDocumentVectors(vectorStore, doc.id);

      // Delete source object if provider supports it
      if (target) {
        try {
          const provider = getProvider(target.sourceType);
          if (provider.deleteObject) {
            await provider.deleteObject(
              target.config as Record<string, unknown>,
              doc.sourceKey,
              target.source ?? undefined,
            );
          }
        } catch {
          // Source object deletion is best-effort
        }
      }

      // Remove DB record
      await db.update(documents).set({ status: 'deleted', updatedAt: new Date() }).where(eq(documents.id, id));

      return c.json({ ok: true });
    },
  }),

  // ── Bulk delete documents ─────────────────────────────────────
  registerApiRoute('/v1/documents/bulk-delete', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(await c.req.json());

      const docs = await db.select().from(documents).where(inArray(documents.id, body.ids));
      if (docs.length === 0) return c.json({ ok: true, deleted: 0 });

      // Group by sync target for efficient provider resolution
      const byTarget = new Map<string, typeof docs>();
      for (const doc of docs) {
        const list = byTarget.get(doc.syncTargetId) ?? [];
        list.push(doc);
        byTarget.set(doc.syncTargetId, list);
      }

      let deleted = 0;
      for (const [syncTargetId, targetDocs] of byTarget) {
        const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, syncTargetId));

        for (const doc of targetDocs) {
          await deleteDocumentVectors(vectorStore, doc.id);

          if (target) {
            try {
              const provider = getProvider(target.sourceType);
              if (provider.deleteObject) {
                await provider.deleteObject(
                  target.config as Record<string, unknown>,
                  doc.sourceKey,
                  target.source ?? undefined,
                );
              }
            } catch {
              // Best-effort
            }
          }
          deleted++;
        }

        const docIds = targetDocs.map((d) => d.id);
        await db
          .update(documents)
          .set({ status: 'deleted', updatedAt: new Date() })
          .where(inArray(documents.id, docIds));
      }

      return c.json({ ok: true, deleted });
    },
  }),

  // ── Move/rename document (S3 only) ────────────────────────────
  registerApiRoute('/v1/documents/:id/move', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const body = z.object({ newSourceKey: z.string().min(1) }).parse(await c.req.json());

      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);

      const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, doc.syncTargetId));
      if (!target) return c.json({ error: 'Sync target not found' }, 404);

      const provider = getProvider(target.sourceType);
      if (!provider.copyObject || !provider.deleteObject) {
        return c.json({ error: 'Move is not supported for this source type' }, 400);
      }

      const config = target.config as Record<string, unknown>;
      const sourceName = target.source ?? undefined;

      // Copy to new key
      await provider.copyObject(config, doc.sourceKey, body.newSourceKey, sourceName);

      // Update DB record
      const [updated] = await db
        .update(documents)
        .set({ sourceKey: body.newSourceKey, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .returning();

      // Update vector metadata
      await updateDocumentVectorSource(sql, id, body.newSourceKey);

      // Delete old source object
      await provider.deleteObject(config, doc.sourceKey, sourceName);

      return c.json(updated);
    },
  }),
];
