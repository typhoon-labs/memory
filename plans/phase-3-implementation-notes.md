# Phase 3 — Implementation Notes

Notes from Phase 3 (Analytics Dashboard) implementation. Reference for future phases.

## No Materialized Views

The master plan specifies 3 materialized views (`score_daily_summary`, `thread_score_summary`, `document_quality_summary`) refreshed via BullMQ. We skipped these — at current scale (hundreds of threads) direct queries with existing indexes execute in single-digit milliseconds. The dashboard API routes query `scores` and `ai_spans` directly with `GROUP BY` and date range filters.

If scale demands it later, materialized views can be layered in without changing the API contract — the dashboard routes just swap their query source.

## In-Memory Cache, Not Redis

No standalone Redis client exists in the codebase — only BullMQ's internal connections. Rather than adding `ioredis` and all its lifecycle management, we use a simple `MemoryCache` class in `apps/api/src/lib/cache.ts`:

```ts
class MemoryCache {
  private store = new Map<string, { data: unknown; expiresAt: number }>();
  get<T>(key: string): T | undefined { ... }
  set(key: string, data: unknown, ttlMs = 60_000): void { ... }
  invalidate(prefix: string): void { ... }
}
```

60-second TTL. Cache key format: `dashboard:{endpoint}:{param1}:{param2}:...`. The cache lives in the API process memory and resets on deploy.

## Scores Endpoint Powers Multiple Widgets

`GET /v1/admin/dashboard/scores` returns all score data grouped by date + scorer_id. The frontend uses this single response for:
- The **Score Trend Chart** (all scorers as multi-line chart)
- The **Hallucination Rate** StatCard (filtered to `scorerId === 'hallucination'`)
- The **Avg Score** StatCard (weighted average across all scorers)
- The **Sparkline** inside the hallucination card (data points as `{ value: avgScore }`)

This avoids separate API calls for each widget and keeps the cache effective.

## recharts CSS Variable Colors

recharts accepts inline CSS color values. The theme already defines `--chart-1` through `--chart-5` in `packages/ui/src/styles/globals.css` (different values for light/dark mode). Charts reference these as `stroke="var(--chart-1)"` etc., giving automatic dark mode support without conditional logic.

## recharts TypeScript Strictness

recharts v3 has strict Tooltip formatter types. The `labelFormatter` expects `(label: ReactNode) => ReactNode` and `formatter` expects `(value: ValueType | undefined) => ReactNode`. Simple `(v: number) => string` functions fail type checking. The fix is to cast:

```tsx
<Tooltip
  labelFormatter={(label) => formatDate(String(label))}
  formatter={(value) => formatMs(Number(value))}
/>
```

## Docker Dev Container — New Dependencies

When adding a new npm dependency (like recharts), `bun add` runs in the Claude sandbox but the Docker dev container uses a `dev_node_modules` volume. The container's `dev-entrypoint` watches for `bun.lock` changes and auto-runs `bun install`:

```
[dev-entrypoint] bun.lock changed — running bun install...
72 packages installed [1.51s]
```

A container restart (`./scripts/docker.sh restart admin`) or rebuild (`./scripts/docker.sh up -d --build admin`) is needed after adding deps. The entrypoint handles the rest automatically.

## Thread JOIN Pattern

The worst-scoring threads query JOINs `scores` to `threads` via `threads.external_id = scores.thread_id`. Note this is a text-to-text join (not UUID) because `scores.thread_id` stores the thread's `externalId` string, not the internal UUID. The `scores_thread_id_idx` index covers this.

## Per-User Quality — resource_id Semantics

`scores.resource_id` is the user whose conversation was scored (the chatbot end-user), not the admin annotator. For human annotations, `resource_id` stores the annotator's user ID while the chatbot user is identified through the thread's `resource_id`. The per-user quality endpoint excludes `scorer_id = 'human-review'` to show only automated quality per end-user.

In the current seeded data, `resource_id` on automated scores is null (the scoring worker doesn't propagate it). The "No user data" empty state is expected until the scoring job is updated to copy `thread.resourceId` to the score's `resource_id`.

## ai_spans Token Attribute Keys

The cost endpoint queries `attributes->>'gen_ai.usage.prompt_tokens'` and `attributes->>'gen_ai.usage.completion_tokens'` following OpenTelemetry semantic conventions. If Mastra uses different keys, the SQL needs adjustment. Verify with:

```sql
SELECT attributes FROM ai_spans WHERE span_type IN ('llm', 'model') LIMIT 1;
```

Cost estimation ($/1K tokens) is done client-side, not server-side, since pricing changes independently of the application.

## Deferred Widgets

Two widgets from the master plan are deferred:

1. **Human vs automated agreement** — Phase 2 just shipped; insufficient human annotation volume to build a meaningful correlation chart. API stub not included (no endpoint).

2. **Per-document quality** — Requires multi-hop JSONB extraction: `scores → messages → _chunkSources → documents`. The master plan itself flags this as "too expensive for live queries." The API returns an empty stub:
   ```json
   { "documents": [], "message": "Per-document quality analytics coming in a future phase." }
   ```

Both can be added without breaking changes when data volume or materialized views justify the effort.

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/lib/cache.ts` | In-memory TTL cache utility |
| `apps/api/src/lib/cache.test.ts` | 6 cache unit tests |
| `apps/api/src/routes/dashboard.ts` | 6 admin dashboard API routes (scores, threads, users, latency, cost, documents stub) |
| `apps/api/src/routes/dashboard.test.ts` | 13 route unit tests |
| `apps/api/src/mastra/index.ts` | Registered `dashboardRoutes` |
| `apps/admin/src/components/charts/sparkline.tsx` | Minimal inline sparkline (no axes/grid) |
| `apps/admin/src/components/charts/score-trend-chart.tsx` | Multi-line chart with data pivot |
| `apps/admin/src/components/charts/latency-chart.tsx` | p50/p95/p99 line chart |
| `apps/admin/src/components/charts/token-bar-chart.tsx` | Stacked bar chart for token usage |
| `apps/admin/src/components/pages/dashboard.tsx` | Full analytics dashboard (replaces 64-line StatCard page) |
| `apps/admin/package.json` | Added `recharts` dependency |
