import { registerApiRoute } from '@mastra/core/server';
import { rerank } from '@mastra/rag';
import { createEmbeddingModel, createRerankerModel } from '@typhoon/ai';
import { PgVector, type RerankFn, refineResults } from '@typhoon/db/drivers/pg';
import { embed } from 'ai';
import { z } from 'zod';
import { sql } from '../db';
import { requireAuth } from '../middleware/require-auth';

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

// biome-ignore lint/suspicious/noExplicitAny: RerankConfig types MastraLanguageModel narrowly
const rerankerModel = createRerankerModel() as any;
const boundReranker: RerankFn = (results, q) =>
  rerank(results, q, rerankerModel, {
    weights: { semantic: 0.5, vector: 0.3, position: 0.2 },
    topK: 10,
  });

const searchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional().default(10),
  minScore: z.number().min(0).max(1).optional().default(0.6),
});

const hybridSearchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).optional().default(10),
  minScore: z.number().min(0).max(1).optional(),
  dedup: z.boolean().optional().default(false),
  rerank: z.boolean().optional().default(false),
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

      const { query, topK, minScore, dedup, rerank: shouldRerank } = body.data;

      try {
        const { embedding } = await embed({
          model: createEmbeddingModel(),
          value: query,
        });

        const queryResults = await vectorStore.hybridQuery({
          indexName: 'knowledge_base',
          queryText: query,
          queryVector: embedding,
          topK,
        });

        const refined = await refineResults(queryResults, query, {
          minScore: minScore ?? undefined,
          dedupKey: dedup ? 'documentId' : undefined,
          reranker: shouldRerank ? boundReranker : undefined,
        });

        const results = refined.map((r) => ({
          text: (r.metadata as Record<string, unknown>)?.text ?? '',
          score: r.score,
          metadata: {
            documentId: (r.metadata as Record<string, unknown>)?.documentId,
            syncTargetId: (r.metadata as Record<string, unknown>)?.syncTargetId,
            source: (r.metadata as Record<string, unknown>)?.source,
            title: (r.metadata as Record<string, unknown>)?.title,
            startIndex: (r.metadata as Record<string, unknown>)?.startIndex ?? null,
          },
        }));

        return c.json({ results });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        return c.json({ error: message }, 500);
      }
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

      const { query, topK, minScore } = body.data;

      try {
        const { embedding } = await embed({
          model: createEmbeddingModel(),
          value: query,
        });

        const queryResults = await vectorStore.query({
          indexName: 'knowledge_base',
          queryVector: embedding,
          topK,
          minScore,
        });

        const results = queryResults.map((r) => ({
          text: (r.metadata as Record<string, unknown>)?.text ?? '',
          score: r.score,
          metadata: {
            documentId: (r.metadata as Record<string, unknown>)?.documentId,
            syncTargetId: (r.metadata as Record<string, unknown>)?.syncTargetId,
            source: (r.metadata as Record<string, unknown>)?.source,
            title: (r.metadata as Record<string, unknown>)?.title,
            startIndex: (r.metadata as Record<string, unknown>)?.startIndex ?? null,
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
