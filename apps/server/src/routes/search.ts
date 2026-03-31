import { registerApiRoute } from '@mastra/core/server';
import { createEmbeddingModel } from '@typhoon/ai';
import { PgVector } from '@typhoon/pg';
import { embed } from 'ai';
import { z } from 'zod';
import { sql } from '../db.js';
import { requireAuth } from '../middleware/require-auth.js';

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

const searchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional().default(10),
});

export const searchRoutes = [
  registerApiRoute('/v1/search', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = searchSchema.safeParse(await c.req.json());
      if (!body.success) {
        return c.json({ error: 'Invalid request', details: body.error.issues }, 400);
      }

      const { query, topK } = body.data;

      try {
        const { embedding } = await embed({
          model: createEmbeddingModel(),
          value: query,
        });

        const queryResults = await vectorStore.query({
          indexName: 'knowledge_base',
          queryVector: embedding,
          topK,
        });

        const results = queryResults.map((r) => ({
          text: (r.metadata as Record<string, unknown>)?.text ?? '',
          score: r.score,
          metadata: {
            documentId: (r.metadata as Record<string, unknown>)?.documentId,
            source: (r.metadata as Record<string, unknown>)?.source,
            title: (r.metadata as Record<string, unknown>)?.title,
          },
        }));

        return c.json({ results });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        return c.json({ error: message }, 500);
      }
    },
  }),
];
