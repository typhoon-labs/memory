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

/** Extract an integer token count from attributes, checking both OTel and Mastra key formats. */
function extractTokens(attributes: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!attributes) return null;
  for (const key of keys) {
    const parts = key.split('.');
    let val: unknown = attributes;
    for (const p of parts) {
      if (val == null || typeof val !== 'object') {
        val = undefined;
        break;
      }
      val = (val as Record<string, unknown>)[p];
    }
    if (val != null) {
      const n = Number(val);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Compute trace status from span data. */
function deriveStatus(hasError: boolean, allCompleted: boolean): 'success' | 'error' | 'partial' {
  if (hasError) return 'error';
  if (allCompleted) return 'success';
  return 'partial';
}

export const traceRoutes = [
  // List traces with filtering and aggregation
  registerApiRoute('/v1/admin/traces', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const { dateFrom, dateTo } = parseDateRange(c);
      const page = Math.max(0, Number(c.req.query('page') ?? '0'));
      const perPage = Math.min(100, Math.max(1, Number(c.req.query('perPage') ?? '50')));
      const statusFilter = c.req.query('status');
      const entityType = c.req.query('entityType');
      const spanType = c.req.query('spanType');
      const minDurationMs = c.req.query('minDurationMs');
      const maxDurationMs = c.req.query('maxDurationMs');
      const search = c.req.query('search');
      const threadId = c.req.query('threadId');

      const cacheKey = `traces:list:${dateFrom}:${dateTo}:${page}:${perPage}:${statusFilter ?? ''}:${entityType ?? ''}:${spanType ?? ''}:${minDurationMs ?? ''}:${maxDurationMs ?? ''}:${search ?? ''}:${threadId ?? ''}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached) return c.json(cached);

      // Build inner WHERE conditions (applied before GROUP BY on raw spans)
      const innerParams: (string | number)[] = [dateFrom, dateTo];
      const innerConditions: string[] = [];

      if (threadId) {
        innerParams.push(threadId);
        innerConditions.push(`"thread_id" = $${innerParams.length}`);
      }

      const innerWhere = innerConditions.length > 0 ? `AND ${innerConditions.join(' AND ')}` : '';

      // Build outer WHERE conditions (applied after GROUP BY on aggregated traces)
      const outerConditions: string[] = [];
      const outerParams: (string | number)[] = [];

      if (statusFilter && ['success', 'error', 'partial'].includes(statusFilter)) {
        // Cannot reference the computed column alias 'status' in WHERE at the same level;
        // inline the CASE expression instead.
        outerConditions.push(
          `(CASE WHEN has_error THEN 'error' WHEN all_completed THEN 'success' ELSE 'partial' END) = '${statusFilter}'`,
        );
      }
      if (entityType) {
        outerParams.push(entityType);
        outerConditions.push(`root_entity_type = $OUTER_${outerParams.length}`);
      }
      if (spanType) {
        outerParams.push(spanType);
        outerConditions.push(`root_span_type = $OUTER_${outerParams.length}`);
      }
      if (minDurationMs) {
        outerParams.push(Number(minDurationMs));
        outerConditions.push(`duration_ms >= $OUTER_${outerParams.length}`);
      }
      if (maxDurationMs) {
        outerParams.push(Number(maxDurationMs));
        outerConditions.push(`duration_ms <= $OUTER_${outerParams.length}`);
      }
      if (search) {
        outerParams.push(`%${search}%`);
        outerConditions.push(`root_span_name ILIKE $OUTER_${outerParams.length}`);
      }

      // Renumber outer params to follow inner params
      const allParams = [...innerParams];
      let outerWhere = '';
      if (outerConditions.length > 0) {
        const renumbered = outerConditions.map((cond) =>
          cond.replace(/\$OUTER_(\d+)/g, (_, n) => {
            const idx = innerParams.length + Number(n);
            return `$${idx}`;
          }),
        );
        outerWhere = `AND ${renumbered.join(' AND ')}`;
        allParams.push(...outerParams);
      }

      const limitIdx = allParams.length + 1;
      const offsetIdx = allParams.length + 2;
      allParams.push(perPage, page * perPage);

      const cteQuery = `
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
          WHERE "started_at" >= $1 AND "started_at" <= $2
            ${innerWhere}
          GROUP BY trace_id
        )
        SELECT *,
          CASE
            WHEN has_error THEN 'error'
            WHEN all_completed THEN 'success'
            ELSE 'partial'
          END AS status
        FROM trace_agg
        WHERE 1=1 ${outerWhere}
        ORDER BY started_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

      const rows = (await sql.unsafe(cteQuery, allParams as (string | number)[])) as Array<{
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
      }>;

      // Count query — same CTE, just count(*)
      const countParams = allParams.slice(0, -2); // remove LIMIT/OFFSET
      const countQuery = `
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
          WHERE "started_at" >= $1 AND "started_at" <= $2
            ${innerWhere}
          GROUP BY trace_id
        )
        SELECT COUNT(*)::int AS count FROM (
          SELECT *,
            CASE
              WHEN has_error THEN 'error'
              WHEN all_completed THEN 'success'
              ELSE 'partial'
            END AS status
          FROM trace_agg
          WHERE 1=1 ${outerWhere}
        ) t`;

      const [countRow] = (await sql.unsafe(countQuery, countParams as (string | number)[])) as Array<{
        count: number;
      }>;
      const total = countRow?.count ?? 0;

      const result = {
        traces: rows.map((r) => ({
          traceId: r.trace_id,
          rootSpanName: r.root_span_name,
          rootSpanType: r.root_span_type,
          rootEntityType: r.root_entity_type,
          rootEntityName: r.root_entity_name,
          threadId: r.thread_id,
          serviceName: r.service_name,
          status: r.status,
          spanCount: r.span_count,
          durationMs: r.duration_ms != null ? Math.round(r.duration_ms) : null,
          startedAt: r.started_at,
          endedAt: r.ended_at,
        })),
        total,
        page,
        perPage,
        hasMore: (page + 1) * perPage < total,
      };

      dashboardCache.set(cacheKey, result, 30_000);
      return c.json(result);
    },
  }),

  // Get full span tree for a single trace
  registerApiRoute('/v1/admin/traces/:traceId', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const traceId = c.req.param('traceId');

      const rows = (await sql.unsafe(`SELECT * FROM "ai_spans" WHERE trace_id = $1 ORDER BY started_at ASC`, [
        traceId,
      ])) as Array<{
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
      }>;

      if (rows.length === 0) {
        return c.json({ error: 'Trace not found' }, 404);
      }

      // Compute per-span derived fields
      const spans = rows.map((r) => {
        const startMs = new Date(r.started_at).getTime();
        const endMs = r.ended_at ? new Date(r.ended_at).getTime() : null;
        return {
          id: r.id,
          spanId: r.span_id,
          parentSpanId: r.parent_span_id,
          name: r.name,
          spanType: r.span_type,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          durationMs: endMs != null ? endMs - startMs : null,
          attributes: r.attributes,
          input: r.input,
          output: r.output,
          error: r.error,
          entityType: r.entity_type,
          entityName: r.entity_name,
          threadId: r.thread_id,
          serviceName: r.service_name,
          promptTokens: extractTokens(r.attributes, 'usage.inputTokens', 'gen_ai.usage.prompt_tokens'),
          completionTokens: extractTokens(r.attributes, 'usage.outputTokens', 'gen_ai.usage.completion_tokens'),
        };
      });

      // Compute summary
      const hasError = spans.some((s) => s.error != null);
      const allCompleted = spans.every((s) => s.endedAt != null);
      const rootSpan = spans.find((s) => s.parentSpanId == null) ?? spans[0];
      const minStart = Math.min(...spans.map((s) => new Date(s.startedAt).getTime()));
      const endTimes = spans.filter((s) => s.endedAt).map((s) => new Date(s.endedAt as string).getTime());
      const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : null;

      return c.json({
        traceId,
        spans,
        summary: {
          status: deriveStatus(hasError, allCompleted),
          spanCount: spans.length,
          durationMs: maxEnd != null ? maxEnd - minStart : null,
          rootSpanName: rootSpan.name,
          threadId: rootSpan.threadId,
          startedAt: new Date(minStart).toISOString(),
          endedAt: maxEnd != null ? new Date(maxEnd).toISOString() : null,
        },
      });
    },
  }),
];
