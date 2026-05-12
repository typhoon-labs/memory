import { registerApiRoute } from '@mastra/core/server';
import { rerankWithScorer } from '@mastra/rag';
import {
  createEmbeddingModel,
  createRerankerScorer,
  EMBEDDING_MAX_CHARS,
  RAG_RERANK_CANDIDATES,
  RAG_RERANK_CANDIDATES_EXPANDED,
  RAG_RERANK_MIN_SCORE,
  RAG_RERANK_WEIGHTS,
  RAG_VECTOR_MIN_SCORE,
} from '@typhoon/ai';
import { PgVector, type RerankFn, refineResults } from '@typhoon/db/drivers/pg';
import { getTracer, SpanStatusCode } from '@typhoon/telemetry';
import { embed } from 'ai';
import { z } from 'zod';
import { sql } from '../db';
import { requireAuth } from '../middleware/require-auth';

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });
const tracer = getTracer('search');

const rerankerScorer = createRerankerScorer();
const createReranker =
  (topK: number): RerankFn =>
  (results, q) =>
    rerankWithScorer({
      results,
      query: q,
      scorer: rerankerScorer,
      options: {
        weights: RAG_RERANK_WEIGHTS,
        topK,
      },
    });

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

      const { query, topK, minScore, dedup, rerank: shouldRerank, expanded } = body.data;
      const candidates = expanded ? RAG_RERANK_CANDIDATES_EXPANDED : RAG_RERANK_CANDIDATES;
      const effectiveTopK = topK ?? candidates;

      try {
        const { embedding } = await embed({
          model: createEmbeddingModel(),
          value: query,
        });

        // Inflate retrieval when reranking so the cross-encoder gets a broad
        // candidate pool to pick from (two-stage retrieve-then-rerank).
        const retrievalK = shouldRerank ? Math.max(candidates, effectiveTopK) : effectiveTopK;

        const queryResults = await vectorStore.hybridQuery({
          indexName: 'knowledge_base',
          queryText: query,
          queryVector: embedding,
          topK: retrievalK,
        });

        const refined = shouldRerank
          ? await tracer.startActiveSpan('rag rerank: hybrid', async (span) => {
              span.setAttribute('rag.candidates', queryResults.length);
              span.setAttribute('rag.topK', effectiveTopK);
              span.setAttribute('rag.expanded', expanded);
              try {
                const result = await refineResults(queryResults, query, {
                  minScore: minScore ?? RAG_RERANK_MIN_SCORE,
                  dedupKey: dedup ? (expanded ? 'chunkId' : 'documentId') : undefined,
                  reranker: createReranker(effectiveTopK),
                });
                const metrics = rerankerScorer.getMetrics(query);
                span.setAttribute('rag.refined_count', result.length);
                if (metrics?.topScore != null) span.setAttribute('rag.top_score', metrics.topScore);
                if (metrics?.durationMs != null) span.setAttribute('rag.duration_ms', metrics.durationMs);
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return { result, metrics };
              } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                span.end();
                throw err;
              }
            })
          : {
              result: await refineResults(queryResults, query, {
                minScore: minScore ?? undefined,
                dedupKey: dedup ? (expanded ? 'chunkId' : 'documentId') : undefined,
                reranker: undefined,
              }),
              metrics: undefined,
            };

        const results = refined.result.map((r) => ({
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

        return c.json({ results, rerank: refined.metrics });
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

      const { query, topK, minScore, rerank: shouldRerank } = body.data;

      try {
        const { embedding } = await embed({
          model: createEmbeddingModel(),
          value: query,
        });

        const retrievalK = shouldRerank ? Math.max(RAG_RERANK_CANDIDATES, topK) : topK;

        const queryResults = await vectorStore.query({
          indexName: 'knowledge_base',
          queryVector: embedding,
          topK: retrievalK,
          minScore: shouldRerank ? undefined : minScore,
        });

        if (shouldRerank) {
          const { result: refined, metrics } = await tracer.startActiveSpan('rag rerank: vector', async (span) => {
            span.setAttribute('rag.candidates', queryResults.length);
            span.setAttribute('rag.topK', topK);
            try {
              const result = await refineResults(queryResults, query, {
                minScore: minScore ?? RAG_RERANK_MIN_SCORE,
                reranker: createReranker(topK),
              });
              const m = rerankerScorer.getMetrics(query);
              span.setAttribute('rag.refined_count', result.length);
              if (m?.topScore != null) span.setAttribute('rag.top_score', m.topScore);
              if (m?.durationMs != null) span.setAttribute('rag.duration_ms', m.durationMs);
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return { result, metrics: m };
            } catch (err) {
              span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
              span.end();
              throw err;
            }
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

          return c.json({ results, rerank: metrics });
        }

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
