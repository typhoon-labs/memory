import { registerApiRoute } from '@mastra/core/server';
import { EMBEDDING_MAX_CHARS, RAG_VECTOR_MIN_SCORE } from '@typhoon/ai';
import { isError } from '@typhoon/services';
import { z } from 'zod';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getSearchService } from '../services';

const searchSchema = z.object({
  query: z.string().min(1).max(EMBEDDING_MAX_CHARS),
  topK: z.number().int().min(1).max(50).optional().default(10),
  minScore: z.number().min(0).max(1).optional().default(RAG_VECTOR_MIN_SCORE),
  rerank: z.boolean().optional().default(false),
});

const hybridSearchSchema = z.object({
  query: z.string().min(1).max(EMBEDDING_MAX_CHARS),
  topK: z.number().int().min(1).max(500).optional(),
  minScore: z.number().min(0).max(1).optional(),
  dedup: z.boolean().optional().default(true),
  rerank: z.boolean().optional().default(true),
  expanded: z.boolean().optional().default(false),
});

export const searchRoutes = [
  registerApiRoute('/v1/search/hybrid', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = hybridSearchSchema.safeParse(await c.req.json());
      if (!body.success) {
        return c.json({ error: 'Invalid request', details: body.error.issues }, 400);
      }

      const result = await getSearchService().hybridSearch(body.data);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
  registerApiRoute('/v1/search', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = searchSchema.safeParse(await c.req.json());
      if (!body.success) {
        return c.json({ error: 'Invalid request', details: body.error.issues }, 400);
      }

      const result = await getSearchService().vectorSearch(body.data);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
