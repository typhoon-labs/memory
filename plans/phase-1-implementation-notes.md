# Phase 1 — Implementation Notes

Notes from Phase 1 (Activate Scoring Engine) implementation. Reference for future phases.

## Scoring Pipeline Architecture

### Flow

```
chat onFinish → enqueue score-message (3s delay) → worker resolves latest assistant message
→ extractScoringData() → create scorers with context → run sequentially → save to scores table
```

- The chat handler does NOT know the assistant message's `externalId` at enqueue time — Mastra persists the message internally and the `onFinish` callback from the AI SDK doesn't expose it. The `messageId` field in `ScoringJobData` is empty; the worker resolves it by querying the latest assistant message in the thread.
- The 3s delay ensures Mastra has finished persisting the message before the worker reads it.

### Queues

`sync`, `reports`, `scoring` — all registered in `apps/api/src/queue.ts` via the `initQueue()` switch. The scoring queue is automatically visible in the admin UI at `/queues` (no admin code changes needed).

### Env Vars

Defined in `@typhoon/config` `scoringSchema`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SCORING_ENABLED` | `true` | Kill switch — `false` or `0` disables worker + enqueue |
| `SCORING_MODEL` | `claude-haiku-4-5-20251001` | LLM model for eval scorers |
| `SCORING_SAMPLE_RATE` | `1.0` | Fraction of responses to score (0.0-1.0) |
| `SCORING_CONCURRENCY` | `5` | Max concurrent scoring workers |
| `SPAN_RETENTION_DAYS` | `90` | Days to keep ai_spans partitions |
| `SCORE_RETENTION_DAYS` | `0` | Days to keep scores (0 = forever) |

## Mastra Scorer API Gotchas

### Message Format

Mastra prebuilt scorers expect `MastraDBMessage` objects, **not plain strings**. The scorer's internal `getTextContentFromMastraDBMessage()` reads `message.content.content` (nested) or `message.content.parts`.

```ts
// WRONG — scorer returns score: 0 with "input/output are empty"
scorer.run({ input: 'question', output: 'answer' })

// CORRECT
scorer.run({
  input: { inputMessages: [{ role: 'user', content: { content: 'question' } }], rememberedMessages: [], systemMessages: [], taggedSystemMessages: {} },
  output: [{ role: 'assistant', content: { content: 'answer' } }],
})
```

### Context Array

Context-dependent scorers (`faithfulness`, `hallucination`, `contextRelevance`, `contextPrecision`) receive context at **construction time**, not at `.run()` time. They also **reject empty context arrays** — `createFaithfulnessScorer({ model, options: { context: [] } })` throws.

When no chunks are retrieved (direct answer), only `answerRelevancy` should run.

### Chunk Extraction — Two Storage Formats

Mastra v6 format (current production):
```json
{ "type": "tool-invocation", "toolInvocation": { "state": "result", "result": { "_chunkSources": [...] } } }
```

Older/hydrate-chunks format:
```json
{ "type": "tool-*", "state": "output-available", "output": { "_chunkSources": [...] } }
```

`extractChunkSources()` in `packages/agents/src/evals/extract-scoring-data.ts` handles both.

## OTel / Telemetry

Use `getActiveTraceId()` from `@typhoon/telemetry` to capture the current trace ID. Do **not** import `@opentelemetry/api` directly in app packages — it's a dependency of `@typhoon/telemetry`, not of the apps.

Capture the traceId **eagerly** at the start of the request handler. By the time `onFinish` fires, the OTel span may have ended and `getActiveTraceId()` would return null.

## Drizzle Migration

The Drizzle snapshot files (`drizzle/meta/0007_snapshot.json` and `0008_snapshot.json`) have a parent snapshot collision. `drizzle-kit generate` fails. Workaround: write migration SQL manually and add the journal entry to `drizzle/meta/_journal.json`.

Migration `0009_scoring_indexes.sql` adds 14 indexes across 5 tables using `CREATE INDEX IF NOT EXISTS`.

## Backfill Script

`bun run backfill:scores -- --dry-run --limit=10` — enqueues scoring jobs for existing assistant messages at `priority: 10` (lower than live scoring's default 0). Batches of 50 with 5s pauses. Uses `queue.getJob(jobId)` for idempotency.

## Key Files

| File | Purpose |
|------|---------|
| `packages/agents/src/evals/extract-scoring-data.ts` | Parse message JSONB → responseText, userQuestion, chunkSources |
| `packages/agents/src/evals/handle-scoring-job.ts` | Core `scoreMessage()` — fetch messages, create scorers, run, save |
| `packages/ingestion/src/jobs/scoring-queue.ts` | Queue factory + `ScoringJobData` type |
| `packages/ingestion/src/jobs/partition-management.ts` | Daily ai_spans partition create/drop |
| `apps/api/src/routes/chat.ts` | `onFinish` hook enqueues scoring, `setScoringQueue()` wiring |
| `apps/api/src/middleware/require-admin.ts` | Admin role check middleware (for future Phase 2 routes) |
| `apps/worker/src/workers.ts` | Scoring worker with `ScoringDeps` construction |
| `packages/config/src/env.ts` | `scoringSchema` + `isScoringEnabled()` |
| `packages/ai/src/index.ts` | `createScoringModel()` factory |
| `packages/telemetry/src/index.ts` | `getActiveTraceId()` helper |
