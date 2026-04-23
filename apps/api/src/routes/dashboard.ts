import { registerApiRoute } from '@mastra/core/server';
import { sql } from '../db';
import { dashboardCache } from '../lib/cache';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';

/** Default date range: 30 days ago → now. */
function parseDateRange(c: { req: { query(key: string): string | undefined } }) {
  const now = new Date();
  const dateTo = c.req.query('dateTo') ?? now.toISOString();
  const dateFrom = c.req.query('dateFrom') ?? new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return { dateFrom, dateTo };
}

export const dashboardRoutes = [
  // Score trends over time — powers line chart + hallucination sparkline
  registerApiRoute('/v1/admin/dashboard/scores', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const scorerId = c.req.query('scorerId');

      const cacheKey = `dashboard:scores:${dateFrom}:${dateTo}:${scorerId ?? ''}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const params: (string | null)[] = [dateFrom, dateTo];
      let scorerFilter = '';
      if (scorerId) {
        params.push(scorerId);
        scorerFilter = `AND "scorer_id" = $${params.length}`;
      }

      const rows = (await sql.unsafe(
        `SELECT
          DATE_TRUNC('day', "created_at")::date AS date,
          "scorer_id",
          AVG("score")::real AS avg_score,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE "score" < 0.5)::int AS fail_count
        FROM "scores"
        WHERE "entity_type" = 'message'
          AND "created_at" >= $1 AND "created_at" <= $2
          ${scorerFilter}
        GROUP BY date, "scorer_id"
        ORDER BY date ASC, "scorer_id"`,
        params as string[],
      )) as Array<{
        date: string;
        scorer_id: string;
        avg_score: number;
        count: number;
        fail_count: number;
      }>;

      const result = {
        series: rows.map((r) => ({
          date: String(r.date),
          scorerId: r.scorer_id,
          avgScore: r.avg_score,
          count: r.count,
          failCount: r.fail_count,
        })),
      };

      dashboardCache.set(cacheKey, result);
      return c.json(result);
    },
  }),

  // Worst-scoring threads
  registerApiRoute('/v1/admin/dashboard/threads', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const limit = Math.min(Number(c.req.query('limit') ?? '10'), 50);

      const cacheKey = `dashboard:threads:${dateFrom}:${dateTo}:${limit}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const rows = (await sql.unsafe(
        `SELECT
          s."thread_id",
          t."title",
          t."resource_id",
          t."created_at" AS thread_created_at,
          AVG(s."score")::real AS avg_score,
          MIN(s."score")::real AS min_score,
          COUNT(*)::int AS score_count
        FROM "scores" s
        JOIN "threads" t ON t."external_id" = s."thread_id"
        WHERE s."entity_type" = 'message'
          AND s."created_at" >= $1 AND s."created_at" <= $2
        GROUP BY s."thread_id", t."title", t."resource_id", t."created_at"
        ORDER BY avg_score ASC
        LIMIT $3`,
        [dateFrom, dateTo, limit],
      )) as Array<{
        thread_id: string;
        title: string;
        resource_id: string;
        thread_created_at: string;
        avg_score: number;
        min_score: number;
        score_count: number;
      }>;

      const result = {
        threads: rows.map((r) => ({
          threadId: r.thread_id,
          title: r.title,
          resourceId: r.resource_id,
          avgScore: r.avg_score,
          minScore: r.min_score,
          scoreCount: r.score_count,
          createdAt: r.thread_created_at,
        })),
      };

      dashboardCache.set(cacheKey, result);
      return c.json(result);
    },
  }),

  // Per-user quality aggregates
  registerApiRoute('/v1/admin/dashboard/users', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const limit = Math.min(Number(c.req.query('limit') ?? '20'), 50);

      const cacheKey = `dashboard:users:${dateFrom}:${dateTo}:${limit}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const rows = (await sql.unsafe(
        `SELECT
          s."resource_id",
          AVG(s."score")::real AS avg_score,
          MIN(s."score")::real AS min_score,
          COUNT(*)::int AS score_count,
          COUNT(DISTINCT s."thread_id")::int AS thread_count
        FROM "scores" s
        WHERE s."entity_type" = 'message'
          AND s."scorer_id" != 'human-review'
          AND s."resource_id" IS NOT NULL
          AND s."created_at" >= $1 AND s."created_at" <= $2
        GROUP BY s."resource_id"
        ORDER BY avg_score ASC
        LIMIT $3`,
        [dateFrom, dateTo, limit],
      )) as Array<{
        resource_id: string;
        avg_score: number;
        min_score: number;
        score_count: number;
        thread_count: number;
      }>;

      const result = {
        users: rows.map((r) => ({
          resourceId: r.resource_id,
          avgScore: r.avg_score,
          minScore: r.min_score,
          scoreCount: r.score_count,
          threadCount: r.thread_count,
        })),
      };

      dashboardCache.set(cacheKey, result);
      return c.json(result);
    },
  }),

  // Response latency percentiles from ai_spans
  registerApiRoute('/v1/admin/dashboard/latency', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);

      const cacheKey = `dashboard:latency:${dateFrom}:${dateTo}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const rows = (await sql.unsafe(
        `SELECT
          DATE_TRUNC('day', "started_at")::date AS date,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p99,
          COUNT(*)::int AS count
        FROM "ai_spans"
        WHERE "span_type" = 'agent'
          AND "ended_at" IS NOT NULL
          AND "started_at" >= $1 AND "started_at" <= $2
        GROUP BY date
        ORDER BY date ASC`,
        [dateFrom, dateTo],
      )) as Array<{
        date: string;
        p50: number;
        p95: number;
        p99: number;
        count: number;
      }>;

      const result = {
        series: rows.map((r) => ({
          date: String(r.date),
          p50: Math.round(r.p50),
          p95: Math.round(r.p95),
          p99: Math.round(r.p99),
          count: r.count,
        })),
      };

      dashboardCache.set(cacheKey, result);
      return c.json(result);
    },
  }),

  // Token usage from ai_spans
  registerApiRoute('/v1/admin/dashboard/cost', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);

      const cacheKey = `dashboard:cost:${dateFrom}:${dateTo}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const rows = (await sql.unsafe(
        `SELECT
          DATE_TRUNC('day', "started_at")::date AS date,
          COALESCE(SUM(("attributes"->>'gen_ai.usage.prompt_tokens')::int), 0)::int AS prompt_tokens,
          COALESCE(SUM(("attributes"->>'gen_ai.usage.completion_tokens')::int), 0)::int AS completion_tokens,
          COUNT(*)::int AS call_count
        FROM "ai_spans"
        WHERE "span_type" IN ('llm', 'model')
          AND "started_at" >= $1 AND "started_at" <= $2
        GROUP BY date
        ORDER BY date ASC`,
        [dateFrom, dateTo],
      )) as Array<{
        date: string;
        prompt_tokens: number;
        completion_tokens: number;
        call_count: number;
      }>;

      const result = {
        series: rows.map((r) => ({
          date: String(r.date),
          promptTokens: r.prompt_tokens,
          completionTokens: r.completion_tokens,
          callCount: r.call_count,
        })),
      };

      dashboardCache.set(cacheKey, result);
      return c.json(result);
    },
  }),

  // Per-document quality — deferred (stub)
  registerApiRoute('/v1/admin/dashboard/documents', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      return c.json({
        documents: [],
        message: 'Per-document quality analytics coming in a future phase.',
      });
    },
  }),
];
