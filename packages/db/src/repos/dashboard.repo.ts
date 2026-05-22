import { sql } from 'drizzle-orm';

import type { Db } from '../client';

export type DateRange = '1d' | '3d' | '7d' | '30d' | '90d';

/** PostgreSQL interval for date_bin, targeting ~90 data points per range. */
const BUCKET_INTERVAL: Record<DateRange, string> = {
  '1d': '15 minutes',
  '3d': '1 hour',
  '7d': '2 hours',
  '30d': '8 hours',
  '90d': '1 day',
};

const VALID_RANGES = new Set<string>(Object.keys(BUCKET_INTERVAL));

/** Validate and normalize a date range string. */
export function normalizeDateRange(raw: string | undefined): DateRange {
  const value = raw ?? '30d';
  return VALID_RANGES.has(value) ? (value as DateRange) : '30d';
}

/** Get the bucket interval string for a given date range. */
export function getBucketInterval(range: DateRange): string {
  return BUCKET_INTERVAL[range];
}

export interface ScoreSeriesRow {
  date: string;
  scorer_id: string;
  avg_score: number;
  count: number;
  fail_count: number;
}

export interface WorstThreadRow {
  thread_id: string;
  title: string;
  resource_id: string;
  thread_created_at: string;
  response_avg: number | null;
  retrieval_avg: number | null;
  score_count: number;
}

export interface UserQualityRow {
  resource_id: string;
  email: string | null;
  response_avg: number | null;
  retrieval_avg: number | null;
  score_count: number;
  thread_count: number;
}

export interface LatencyRow {
  date: string;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface CostRow {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  call_count: number;
}

export class DashboardRepo {
  constructor(private db: Db) {}

  /** Generate all time-bucket timestamps between dateFrom and dateTo. */
  async queryBuckets(dateFrom: string, dateTo: string, bucket: string): Promise<string[]> {
    const rows = (await this.db.execute(
      sql`SELECT generate_series(
        date_bin(${sql.raw(`'${bucket}'`)}, ${dateFrom}::timestamptz, TIMESTAMP '2001-01-01'),
        date_bin(${sql.raw(`'${bucket}'`)}, ${dateTo}::timestamptz, TIMESTAMP '2001-01-01'),
        ${sql.raw(`'${bucket}'`)}::interval
      )::text AS date`,
    )) as unknown as Array<{ date: string }>;
    return rows.map((r) => r.date);
  }

  /** Query score trends aggregated by time bucket and scorer. */
  async getScoreSeries(dateFrom: string, dateTo: string, bucket: string, scorerId?: string): Promise<ScoreSeriesRow[]> {
    const scorerFilter = scorerId ? sql`AND "scorer_id" = ${scorerId}` : sql``;

    const rows = await this.db.execute(
      sql`SELECT
        date_bin(${sql.raw(`'${bucket}'`)}, "created_at", TIMESTAMP '2001-01-01')::text AS date,
        "scorer_id",
        AVG("score")::real AS avg_score,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE "score" < 0.5)::int AS fail_count
      FROM "scores"
      WHERE "entity_type" = 'message'
        AND "created_at" >= ${dateFrom} AND "created_at" <= ${dateTo}
        ${scorerFilter}
      GROUP BY date, "scorer_id"
      ORDER BY date ASC, "scorer_id"`,
    );
    return rows as unknown as ScoreSeriesRow[];
  }

  /** Query worst-scoring threads by response average. */
  async getWorstThreads(dateFrom: string, dateTo: string, limit: number): Promise<WorstThreadRow[]> {
    const rows = await this.db.execute(
      sql`SELECT
        s."thread_id",
        t."title",
        t."resource_id",
        t."created_at" AS thread_created_at,
        AVG(CASE
          WHEN s."scorer_id" IN ('answerRelevancy', 'faithfulness') THEN s."score"
          WHEN s."scorer_id" = 'hallucination' THEN 1 - s."score"
        END)::real AS response_avg,
        AVG(CASE
          WHEN s."scorer_id" IN ('contextRelevance', 'contextPrecision') THEN s."score"
        END)::real AS retrieval_avg,
        COUNT(*) FILTER (WHERE s."scorer_id" != 'human-review')::int AS score_count
      FROM "scores" s
      JOIN "threads" t ON t."external_id" = s."thread_id"
      WHERE s."entity_type" = 'message'
        AND s."created_at" >= ${dateFrom} AND s."created_at" <= ${dateTo}
      GROUP BY s."thread_id", t."title", t."resource_id", t."created_at"
      ORDER BY response_avg ASC NULLS LAST
      LIMIT ${limit}`,
    );
    return rows as unknown as WorstThreadRow[];
  }

  /** Query per-user quality aggregates. */
  async getUserQuality(dateFrom: string, dateTo: string, limit: number): Promise<UserQualityRow[]> {
    const rows = await this.db.execute(
      sql`SELECT
        t."resource_id",
        u."email",
        AVG(CASE
          WHEN s."scorer_id" IN ('answerRelevancy', 'faithfulness') THEN s."score"
          WHEN s."scorer_id" = 'hallucination' THEN 1 - s."score"
        END)::real AS response_avg,
        AVG(CASE
          WHEN s."scorer_id" IN ('contextRelevance', 'contextPrecision') THEN s."score"
        END)::real AS retrieval_avg,
        COUNT(*) FILTER (WHERE s."scorer_id" != 'human-review')::int AS score_count,
        COUNT(DISTINCT s."thread_id")::int AS thread_count
      FROM "scores" s
      JOIN "threads" t ON t."external_id" = s."thread_id"
      LEFT JOIN "user" u ON u."id"::text = t."resource_id"
      WHERE s."entity_type" = 'message'
        AND s."scorer_id" != 'human-review'
        AND s."created_at" >= ${dateFrom} AND s."created_at" <= ${dateTo}
      GROUP BY t."resource_id", u."email"
      ORDER BY response_avg ASC NULLS LAST
      LIMIT ${limit}`,
    );
    return rows as unknown as UserQualityRow[];
  }

  /** Query response latency percentiles from ai_spans. */
  async getLatencySeries(dateFrom: string, dateTo: string, bucket: string): Promise<LatencyRow[]> {
    const rows = await this.db.execute(
      sql`SELECT
        date_bin(${sql.raw(`'${bucket}'`)}, "started_at", TIMESTAMP '2001-01-01')::text AS date,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("ended_at" - "started_at")) * 1000) AS p99,
        COUNT(*)::int AS count
      FROM "ai_spans"
      WHERE "span_type" IN ('agent', 'agent_run')
        AND "ended_at" IS NOT NULL
        AND "started_at" >= ${dateFrom} AND "started_at" <= ${dateTo}
      GROUP BY date
      ORDER BY date ASC`,
    );
    return rows as unknown as LatencyRow[];
  }

  /** Query token usage from ai_spans. */
  async getCostSeries(dateFrom: string, dateTo: string, bucket: string): Promise<CostRow[]> {
    const rows = await this.db.execute(
      sql`SELECT
        date_bin(${sql.raw(`'${bucket}'`)}, "started_at", TIMESTAMP '2001-01-01')::text AS date,
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
        AND "started_at" >= ${dateFrom} AND "started_at" <= ${dateTo}
      GROUP BY date
      ORDER BY date ASC`,
    );
    return rows as unknown as CostRow[];
  }
}
