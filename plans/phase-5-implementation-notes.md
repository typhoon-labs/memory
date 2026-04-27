# Phase 5 — Implementation Notes

Notes from Phase 5 (Trace Explorer) implementation. Reference for future phases.

## Spans Live in PostgreSQL, Not Just Tempo

The OTel collector exports traces to Tempo for Grafana visualization, but Mastra's `DrizzleObservabilityStorage` writes spans to the `ai_spans` PostgreSQL table for application-level queries. These are two independent paths — Tempo is for infrastructure-level trace visualization, PostgreSQL is for admin UI queries.

In development, spans only appear in PostgreSQL when Mastra's observability bridge persists them during agent execution. HTTP-level spans (from `@hono/otel`) go only to the collector. This means the `ai_spans` table may be empty even when Tempo shows traces.

## Date Serialization Bug (Third Occurrence)

The same `new Date()` vs `.toISOString()` bug from Phase 4 (datasets, experiments) existed in `DrizzleObservabilityStorage`:

- `createSpanWith()` lines 76-77: `new Date()` for `created_at`/`updated_at`
- `batchCreateSpans()` line 208: `const now = new Date()` with `as unknown as string` casts on lines 248-249

The `postgres` library's `unsafe()` method cannot serialize Date objects in parameter arrays. Fixed all three locations to use `.toISOString()`.

**Pattern for future phases:** Any storage class using `sql.unsafe()` with `new Date()` parameters will hit this bug. Always use `new Date().toISOString()` when passing timestamps as parameters to `unsafe()`.

## Raw SQL Over Storage Class Methods

Phase 5 uses raw SQL via `sql.unsafe()` for both trace routes rather than the existing `DrizzleObservabilityStorage` methods. The reasons:

1. **`listTraces()` is too limited** — returns only `{ trace_id, started_at }` per trace. The list page needs span count, duration, root span name/type, entity info, thread ID, and derived status — all computable from a single aggregate CTE query.

2. **Aggregate CTE pattern** — The trace list query uses a `WITH trace_agg AS (...)` CTE that groups by `trace_id`, computes aggregates (`COUNT`, `MIN`/`MAX` timestamps, `BOOL_OR`/`BOOL_AND` for status, `ARRAY_AGG` with ordering for root span info), then applies outer filters on the computed columns. This is a fundamentally different query pattern from what the storage class provides.

3. **Consistency with dashboard routes** — The dashboard already queries `ai_spans` directly for latency percentiles and token costs. Trace routes follow the same pattern.

`DrizzleObservabilityStorage` was still exported from `@typhoon/pg` for general availability and future use.

## SQL Column Alias in WHERE — PostgreSQL Limitation

The status filter caused a 500 error in initial testing. The CTE query computes `status` via a CASE expression:

```sql
SELECT *,
  CASE WHEN has_error THEN 'error'
       WHEN all_completed THEN 'success'
       ELSE 'partial'
  END AS status
FROM trace_agg
WHERE status = 'error'  -- FAILS: can't reference alias at same SELECT level
```

PostgreSQL does not allow referencing a column alias in the WHERE clause of the same SELECT level where it's defined. The fix is to inline the CASE expression in the WHERE:

```sql
WHERE (CASE WHEN has_error THEN 'error'
            WHEN all_completed THEN 'success'
            ELSE 'partial' END) = 'error'
```

## Dynamic Query Builder Pattern

The trace list route builds SQL dynamically with two layers of filters:

- **Inner filters** (before GROUP BY): `threadId`, applied to raw spans inside the CTE
- **Outer filters** (after GROUP BY): `status`, `entityType`, `spanType`, `duration`, `search` — applied to aggregated trace summaries

Outer parameter placeholders use a `$OUTER_N` prefix during construction, then get renumbered to follow inner parameters before execution. This avoids parameter index collisions when both inner and outer filters are active.

## Waterfall Visualization — CSS Percentage Bars

The span waterfall uses CSS `position: absolute` with percentage-based `left` and `width` values:

```ts
const leftPct = ((spanStart - traceStart) / traceDuration) * 100;
const widthPct = (spanDuration / traceDuration) * 100;
```

Bars have a minimum width of `0.5%` to ensure very short spans remain visible. Color is determined by `spanType` — blue for agent, purple for model, amber for tool, emerald for scorer, cyan for workflow, zinc for generic.

This approach was chosen over Recharts (overkill for a tree structure) or SVG (unnecessary complexity). CSS percentage bars are naturally responsive and require no additional dependencies.

## Span Tree Construction

The API returns a flat array of spans ordered by `started_at`. The UI builds a tree using `parentSpanId` relationships:

```ts
function buildSpanTree(spans: Span[]): SpanNode[] {
  const bySpanId = new Map(spans.map(s => [s.spanId, { span: s, children: [], depth: 0 }]));
  for (const node of bySpanId.values()) {
    if (node.span.parentSpanId && bySpanId.has(node.span.parentSpanId)) {
      bySpanId.get(node.span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
}
```

Orphan spans (where `parentSpanId` references a span not in this trace) become root nodes. Default expansion: top 2 levels open, deeper levels collapsed.

## Token Extraction — Server-Side from Attributes JSONB

Token counts are stored in the `attributes` JSONB column under OpenTelemetry semantic convention keys: `gen_ai.usage.prompt_tokens` and `gen_ai.usage.completion_tokens`. The trace detail API extracts these server-side so the UI doesn't need to know JSONB attribute key names.

## Caching Strategy

The trace list uses `dashboardCache` with a **30-second TTL** (shorter than the dashboard's 60s) because trace data changes more frequently. The trace detail endpoint has **no caching** — single trace lookups are cheap (indexed by `trace_id`) and must be fresh.

## Cross-Linking Between Traces and Reviews

Bidirectional links were added:

- **Trace detail → Review:** When `summary.threadId` is present, a "View Review" button links to `/reviews/$threadId`
- **Review detail → Traces:** A "View Traces" button links to `/traces?threadId=$threadId`, which filters the trace list to show only traces associated with that conversation

The `threadId` filter is applied as an inner condition in the CTE (before GROUP BY) since it's a span-level attribute.

## Key Files

| File | Purpose |
|------|---------|
| `packages/pg/src/storage/observability.ts` | Observability storage (Date bug fixed) |
| `packages/pg/src/index.ts` | Added `DrizzleObservabilityStorage` export |
| `apps/api/src/routes/traces.ts` | 2 trace API routes (list + detail) |
| `apps/api/src/routes/traces.test.ts` | 15 trace route unit tests |
| `apps/api/src/mastra/index.ts` | Registered `traceRoutes` |
| `apps/admin/src/components/pages/traces.tsx` | Trace list page with filters |
| `apps/admin/src/components/pages/trace-detail.tsx` | Trace detail with waterfall |
| `apps/admin/src/components/pages/trace-detail/span-tree.tsx` | Recursive span tree + CSS timing bars |
| `apps/admin/src/components/pages/trace-detail/span-detail-sheet.tsx` | Resizable side panel for span details |
| `apps/admin/src/components/pages/trace-detail/shared.ts` | Types, helpers, color mapping |
| `apps/admin/src/layouts/admin-shell.tsx` | Added Traces nav item |
| `apps/admin/src/routes/route-tree.ts` | Registered 2 new routes |
| `apps/admin/src/components/pages/review-detail.tsx` | Added "View Traces" cross-link |
