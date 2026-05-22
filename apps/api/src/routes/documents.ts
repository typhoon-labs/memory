import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { z } from 'zod';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getDocumentService } from '../services';

export const documentRoutes = [
  registerApiRoute('/v1/documents', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().list(c.req.query('syncTargetId'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().getById(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id/chunks', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().getChunks(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id/parsed-content', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const clientEtag = c.req.header('If-None-Match');
      const result = await getDocumentService().getParsedContent(c.req.param('id'), clientEtag);
      if (isError(result)) return errorResponse(c, result);
      if ('notModified' in result.data) {
        return new Response(null, { status: 304 });
      }
      return c.json({ text: result.data.text }, 200, {
        'Cache-Control': 'private, max-age=300',
        ...(result.data.contentHash && { ETag: result.data.contentHash }),
      });
    },
  }),

  registerApiRoute('/v1/documents/:id/download', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().download(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      const { content, mimeType, filename } = result.data;
      return new Response(content.buffer as ArrayBuffer, {
        headers: {
          'Content-Type': mimeType ?? 'application/octet-stream',
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
      const result = await getDocumentService().retryFailed(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id/resync', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().resync(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = z
        .object({
          title: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          customMetadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(await c.req.json());

      const result = await getDocumentService().updateMetadata(c.req.param('id'), body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/bulk-metadata', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(100),
          customMetadata: z.record(z.string(), z.unknown()),
          merge: z.boolean().default(true),
        })
        .parse(await c.req.json());

      const result = await getDocumentService().bulkUpdateMetadata(body);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/metadata-fields', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().getMetadataFields(c.req.query('syncTargetId'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getDocumentService().deleteDocument(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/bulk-delete', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(await c.req.json());
      const result = await getDocumentService().bulkDelete(body.ids);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/bulk-purge', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(await c.req.json());
      const result = await getDocumentService().bulkPurge(body.ids);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/documents/:id/move', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = z.object({ newSourceKey: z.string().min(1) }).parse(await c.req.json());
      const result = await getDocumentService().move(c.req.param('id'), body.newSourceKey);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
