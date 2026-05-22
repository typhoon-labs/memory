import { type SQL, sql } from 'drizzle-orm';

import type { Db } from '../client';

export interface TraceListFilters {
  dateFrom: string;
  dateTo: string;
  page: number;
  perPage: number;
  status?: string;
  entityType?: string;
  spanType?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  search?: string;
  threadId?: string;
}

export interface TraceAggRow {
  trace_id: string;
  started_at: string;
  ended_at: string | null;
  span_count: number;
  duration_ms: number | null;
  has_error: boolean;
  all_completed: boolean;
  root_span_name: string;
  root_span_type: string;
  root_entity_type: string | null;
  root_entity_name: string | null;
  thread_id: string | null;
  service_name: string | null;
  status: string;
}

export interface SpanRow {
  id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  span_type: string;
  started_at: string;
  ended_at: string | null;
  attributes: Record<string, unknown> | null;
  input: unknown;
  output: unknown;
  error: { message: string; name?: string; stack?: string } | null;
  entity_type: string | null;
  entity_name: string | null;
  thread_id: string | null;
  service_name: string | null;
}

export class TraceRepo {
  constructor(private db: Db) {}

  /** List traces with filtering and aggregation. Returns rows + total count. */
  async listTraces(filters: TraceListFilters): Promise<{ rows: TraceAggRow[]; total: number }> {
    const {
      dateFrom,
      dateTo,
      page,
      perPage,
      status,
      entityType,
      spanType,
      minDurationMs,
      maxDurationMs,
      search,
      threadId,
    } = filters;

    // Build inner WHERE conditions (applied before GROUP BY on raw spans)
    const innerConditions: SQL[] = [];
    if (threadId) {
      innerConditions.push(sql`"thread_id" = ${threadId}`);
    }

    const innerWhere = innerConditions.length > 0 ? sql`AND ${sql.join(innerConditions, sql` AND `)}` : sql``;

    // Build outer WHERE conditions (applied after GROUP BY on aggregated traces)
    const outerConditions: SQL[] = [];

    if (status && ['success', 'error', 'partial'].includes(status)) {
      outerConditions.push(
        sql`(CASE WHEN has_error THEN 'error' WHEN all_completed THEN 'success' ELSE 'partial' END) = ${status}`,
      );
    }
    if (entityType) {
      outerConditions.push(sql`root_entity_type = ${entityType}`);
    }
    if (spanType) {
      outerConditions.push(sql`root_span_type = ${spanType}`);
    }
    if (minDurationMs !== null && minDurationMs !== undefined) {
      outerConditions.push(sql`duration_ms >= ${minDurationMs}`);
    }
    if (maxDurationMs !== null && maxDurationMs !== undefined) {
      outerConditions.push(sql`duration_ms <= ${maxDurationMs}`);
    }
    if (search) {
      const pattern = `%${search}%`;
      outerConditions.push(sql`(root_span_name ILIKE ${pattern} OR trace_id ILIKE ${pattern})`);
    }

    const outerWhere = outerConditions.length > 0 ? sql`AND ${sql.join(outerConditions, sql` AND `)}` : sql``;

    const cteBody = sql`
      WITH trace_agg AS (
        SELECT
          trace_id,
          MIN(started_at) AS started_at,
          MAX(ended_at) AS ended_at,
          COUNT(*)::int AS span_count,
          EXTRACT(EPOCH FROM (MAX(ended_at) - MIN(started_at))) * 1000 AS duration_ms,
          BOOL_OR(error IS NOT NULL) AS has_error,
          BOOL_AND(ended_at IS NOT NULL OR span_type = 'model_chunk') AS all_completed,
          (ARRAY_AGG(name ORDER BY parent_span_id NULLS FIRST, started_at ASC))[1] AS root_span_name,
          (ARRAY_AGG(span_type ORDER BY parent_span_id NULLS FIRST, started_at ASC))[1] AS root_span_type,
          (ARRAY_AGG(entity_type ORDER BY parent_span_id NULLS FIRST, started_at ASC))[1] AS root_entity_type,
          (ARRAY_AGG(entity_name ORDER BY parent_span_id NULLS FIRST, started_at ASC))[1] AS root_entity_name,
          (ARRAY_AGG(thread_id ORDER BY parent_span_id NULLS FIRST, started_at ASC))[1] AS thread_id,
          (ARRAY_AGG(service_name ORDER BY parent_span_id NULLS FIRST, started_at ASC))[1] AS service_name
        FROM "ai_spans"
        WHERE "started_at" >= ${dateFrom} AND "started_at" <= ${dateTo}
          ${innerWhere}
        GROUP BY trace_id
      )`;

    const selectWithStatus = sql`
      SELECT *,
        CASE
          WHEN has_error THEN 'error'
          WHEN all_completed THEN 'success'
          ELSE 'partial'
        END AS status
      FROM trace_agg
      WHERE 1=1 ${outerWhere}`;

    const rows = (await this.db.execute(
      sql`${cteBody} ${selectWithStatus} ORDER BY started_at DESC LIMIT ${perPage} OFFSET ${page * perPage}`,
    )) as unknown as TraceAggRow[];

    // Count query — same CTE, just count(*)
    const countRows = (await this.db.execute(
      sql`${cteBody} SELECT COUNT(*)::int AS count FROM (${selectWithStatus}) t`,
    )) as unknown as Array<{ count: number }>;
    const total = countRows[0]?.count ?? 0;

    return { rows, total };
  }

  /** Get all spans for a trace, ordered by started_at. */
  async getSpansByTraceId(traceId: string): Promise<SpanRow[]> {
    const rows = await this.db.execute(
      sql`SELECT * FROM "ai_spans" WHERE trace_id = ${traceId} ORDER BY started_at ASC`,
    );
    return rows as unknown as SpanRow[];
  }
}
