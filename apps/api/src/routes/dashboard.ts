import { registerApiRoute } from '@mastra/core/server';
import { sql } from '../db';
import { dashboardCache } from '../lib/cache';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';

type DateRange = '1d' | '3d' | '7d' | '30d' | '90d';

/** PostgreSQL interval for date_bin, targeting ~90 data points per range. */
const BUCKET_INTERVAL: Record<DateRange, string> = {
  '1d': '15 minutes',
  '3d': '1 hour',
  '7d': '2 hours',
  '30d': '8 hours',
  '90d': '1 day',
};

const VALID_RANGES = new Set<string>(Object.keys(BUCKET_INTERVAL));

/** Generate all time-bucket timestamps between dateFrom and dateTo. */
async function queryBuckets(dateFrom: string, dateTo: string, bucket: string): Promise<string[]> {
  const rows = (await sql.unsafe(
    `SELECT generate_series(
      date_bin('${bucket}', $1::timestamptz, TIMESTAMP '2001-01-01'),
      date_bin('${bucket}', $2::timestamptz, TIMESTAMP '2001-01-01'),
      '${bucket}'::interval
    )::text AS date`,
    [dateFrom, dateTo],
  )) as Array<{ date: string }>;
  return rows.map((r) => r.date);
}

/** Default date range: 30 days ago → now. */
function parseDateRange(c: { req: { query(key: string): string | undefined } }) {
  const now = new Date();
  const dateTo = c.req.query('dateTo') ?? now.toISOString();
  const dateFrom = c.req.query('dateFrom') ?? new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rawRange = c.req.query('range') ?? '30d';
  const range: DateRange = VALID_RANGES.has(rawRange) ? (rawRange as DateRange) : '30d';
  return { dateFrom, dateTo, range };
}

export const dashboardRoutes = [
  // Score trends over time — powers line chart + hallucination sparkline
  registerApiRoute('/v1/admin/dashboard/scores', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo, range } = parseDateRange(c);
      const scorerId = c.req.query('scorerId');
      const bucket = BUCKET_INTERVAL[range];

      const cacheKey = `dashboard:scores:${dateFrom}:${dateTo}:${range}:${scorerId ?? ''}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const params: (string | null)[] = [dateFrom, dateTo];
      let scorerFilter = '';
      if (scorerId) {
        params.push(scorerId);
        scorerFilter = `AND "scorer_id" = $${params.length}`;
      }

      const [buckets, rows] = await Promise.all([
        queryBuckets(dateFrom, dateTo, bucket),
        sql.unsafe(
          `SELECT
            date_bin('${bucket}', "created_at", TIMESTAMP '2001-01-01')::text AS date,
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
        ) as Promise<
          Array<{
            date: string;
            scorer_id: string;
            avg_score: number;
            count: number;
            fail_count: number;
          }>
        >,
      ]);

      const result = {
        series: rows.map((r) => ({
          date: String(r.date),
          scorerId: r.scorer_id,
          avgScore: r.avg_score,
          count: r.count,
          failCount: r.fail_count,
        })),
        buckets,
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
          t."resource_id",
          u."email",
          AVG(s."score")::real AS avg_score,
          MIN(s."score")::real AS min_score,
          COUNT(*)::int AS score_count,
          COUNT(DISTINCT s."thread_id")::int AS thread_count
        FROM "scores" s
        JOIN "threads" t ON t."external_id" = s."thread_id"
        LEFT JOIN "user" u ON u."id"::text = t."resource_id"
        WHERE s."entity_type" = 'message'
          AND s."scorer_id" != 'human-review'
          AND s."created_at" >= $1 AND s."created_at" <= $2
        GROUP BY t."resource_id", u."email"
        ORDER BY avg_score ASC
        LIMIT $3`,
        [dateFrom, dateTo, limit],
      )) as Array<{
        resource_id: string;
        email: string | null;
        avg_score: number;
        min_score: number;
        score_count: number;
        thread_count: number;
      }>;

      const result = {
        users: rows.map((r) => ({
          resourceId: r.resource_id,
          email: r.email,
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
      const { dateFrom, dateTo, range } = parseDateRange(c);
      const bucket = BUCKET_INTERVAL[range];

      const cacheKey = `dashboard:latency:${dateFrom}:${dateTo}:${range}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const [buckets, rows] = await Promise.all([
        queryBuckets(dateFrom, dateTo, bucket),
        sql.unsafe(
          `SELECT
            date_bin('${bucket}', "started_at", TIMESTAMP '2001-01-01')::text AS date,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p50,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p95,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p99,
            COUNT(*)::int AS count
          FROM "ai_spans"
          WHERE "span_type" IN ('agent', 'agent_run')
            AND "ended_at" IS NOT NULL
            AND "started_at" >= $1 AND "started_at" <= $2
          GROUP BY date
          ORDER BY date ASC`,
          [dateFrom, dateTo],
        ) as Promise<
          Array<{
            date: string;
            p50: number;
            p95: number;
            p99: number;
            count: number;
          }>
        >,
      ]);

      const dataMap = new Map(rows.map((r) => [String(r.date), r]));
      const result = {
        series: buckets.map((date) => {
          const d = dataMap.get(date);
          return d
            ? { date, p50: Math.round(d.p50), p95: Math.round(d.p95), p99: Math.round(d.p99), count: d.count }
            : { date, p50: null, p95: null, p99: null, count: 0 };
        }),
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
      const { dateFrom, dateTo, range } = parseDateRange(c);
      const bucket = BUCKET_INTERVAL[range];

      const cacheKey = `dashboard:cost:${dateFrom}:${dateTo}:${range}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      const [buckets, rows] = await Promise.all([
        queryBuckets(dateFrom, dateTo, bucket),
        sql.unsafe(
          `SELECT
            date_bin('${bucket}', "started_at", TIMESTAMP '2001-01-01')::text AS date,
            COALESCE(SUM(
              COALESCE(
                ("attributes"->>'gen_ai.usage.prompt_tokens')::int,
                ("attributes"->'usage'->>'inputTokens')::int
              )
            ), 0)::int AS prompt_tokens,
            COALESCE(SUM(
              COALESCE(
                ("attributes"->>'gen_ai.usage.completion_tokens')::int,
                ("attributes"->'usage'->>'outputTokens')::int
              )
            ), 0)::int AS completion_tokens,
            COUNT(*)::int AS call_count
          FROM "ai_spans"
          WHERE "span_type" IN ('llm', 'model', 'model_generation', 'model_step')
            AND "started_at" >= $1 AND "started_at" <= $2
          GROUP BY date
          ORDER BY date ASC`,
          [dateFrom, dateTo],
        ) as Promise<
          Array<{
            date: string;
            prompt_tokens: number;
            completion_tokens: number;
            call_count: number;
          }>
        >,
      ]);

      const dataMap = new Map(rows.map((r) => [String(r.date), r]));
      const result = {
        series: buckets.map((date) => {
          const d = dataMap.get(date);
          return d
            ? { date, promptTokens: d.prompt_tokens, completionTokens: d.completion_tokens, callCount: d.call_count }
            : { date, promptTokens: 0, completionTokens: 0, callCount: 0 };
        }),
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
