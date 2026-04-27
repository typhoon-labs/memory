# Conversation Review & Evals

Replace the admin feedback page with a conversation review console backed by Mastra's eval/scoring infrastructure.

## Goals

1. View full chat exchanges (thread timeline with messages, retrieved chunks, source documents)
2. Score agent responses automatically using Mastra's RAG scorers
3. Collect structured human annotations (replacing binary thumbs up/down)
4. Analyze response quality with dashboards and cross-domain analytics
5. Run systematic experiments with curated datasets

## Decision Log

### Build vs Buy

Evaluated self-hostable, OTel-native observability platforms:

| Tool | License | Eval Engine | Key Strength | Why Not |
|------|---------|-------------|--------------|---------|
| **Langfuse** | MIT (core) | None (receives scores) | Most mature, largest community, ClickHouse-backed | Adds 4 storage layers (PG + CH + Redis + S3), splits data, separate auth |
| **LangWatch** | MIT (SDK) | Built-in + agent simulations | Native Mastra integration | Smaller community, docs still maturing |
| **Opik** | Apache 2.0 | Built-in LLM-as-judge | Clean UI, Helm-ready, no enterprise gating | JS/TS SDK immature (Python-first), needs CH + MySQL + Redis |
| **OpenLIT** | Apache 2.0 | 11 built-in + custom | Most OTel-native, lightweight, GPU/MCP monitoring | No RBAC, no datasets, no annotation workflows |

**Decision:** Build on Mastra. The storage layer (scores, experiments, datasets, observability, scorer definitions) is already fully implemented in `@typhoon/pg`. Only API routes and admin UI are missing. Building in-house gives us:

- Zero new infrastructure or dependencies
- Single PostgreSQL database for all data (scores, threads, spans, documents)
- Cross-domain SQL queries Langfuse structurally cannot do (per-document quality, source gap analysis, RAG lineage)
- Unified auth via Better Auth + OIDC (no separate login)
- Full control over scoring pipeline

**Future escape hatch:** If we outgrow PostgreSQL for analytics, add Langfuse as a visualization layer. It pairs cleanly with Mastra because it receives scores rather than generating them (no competing eval engines).

### Span Storage Strategy

**Now — Option 1:** Keep dual-write (Mastra writes to `ai_spans` in PostgreSQL, OTel exports to provider). Manage growth with:

- Daily table partitioning on `ai_spans`
- Configurable retention (default 90 days) — BullMQ cron drops expired partitions
- Materialized views for dashboard aggregations
- Handles ~5M spans comfortably

**Future — Option 4:** When PostgreSQL becomes the bottleneck, move `ai_spans` to ClickHouse. The migration is clean — `DrizzleObservabilityStorage` is isolated behind Mastra's storage interface. Options:

- ClickHouse Cloud on AWS Marketplace (managed, pay-as-you-go)
- Self-hosted ClickHouse on ECS

Everything else (scores, experiments, datasets, threads, messages) stays in PostgreSQL regardless.

**Why not drop ai_spans entirely (Option 3):** We use trace sampling in production. Sampled-out traces would be lost from the OTel provider, but Mastra writes to `ai_spans` on every execution regardless of sampling. Dropping `ai_spans` means scored conversations may have no trace to inspect.

## Current State

### Infrastructure Ready (schema + storage, no API or UI)

| Component | Schema | Storage | Location |
|-----------|--------|---------|----------|
| Scores | `packages/db/src/schema/scores.ts` | `packages/pg/src/storage/scores.ts` | `DrizzleScoresStorage` — save, get, list by scorer/run/entity/span |
| Experiments | `packages/db/src/schema/experiments.ts` | `packages/pg/src/storage/experiments.ts` | `DrizzleExperimentsStorage` — full CRUD + results tracking |
| Datasets | `packages/db/src/schema/datasets.ts` | `packages/pg/src/storage/datasets.ts` | `DrizzleDatasetsStorage` — SCD-2 versioned items, batch ops |
| Observability | `packages/db/src/schema/observability.ts` | `packages/pg/src/storage/observability.ts` | `DrizzleObservabilityStorage` — spans, traces, batch ops |
| Scorer Definitions | `packages/db/src/schema/versioned/scorer-definitions.ts` | `packages/pg/src/storage/scorer-definitions.ts` | Versioned CRUD via `VersionedStorageHelper` |

### Evals Configured (not running in production)

- 5 RAG scorers in `packages/agents/src/evals/scorers.ts`: faithfulness, hallucination, answerRelevancy, contextRelevance, contextPrecision
- Runner in `packages/agents/src/evals/run.ts`: `runRagEvals(agent, model, data[])`
- `scoreTraces()` available from `@mastra/core/evals` for retroactive scoring
- 15+ additional prebuilt scorers available from `@mastra/evals/scorers/prebuilt`

### What Exists Today

- Feedback: binary thumbs up/down + optional comment, flat table in admin, two counters on dashboard
- Threads/messages: full CRUD API at `/v1/threads`, no admin UI for browsing
- Admin pages: dashboard, sync sources, documents, feedback, queues

## Prerequisites — Integration Gaps

Issues found in the current codebase that must be resolved before or during Phase 1.

### No `requireAdmin` Middleware

The existing admin feedback endpoint (`GET /v1/feedback` without `threadId`) returns all feedback to any authenticated user — there's no admin role check. All new admin routes need a proper `requireAdmin` middleware.

**Fix:** Create `requireAdmin` middleware in `apps/api/src/middleware/` that checks Better Auth's admin role (`session.user.role === 'admin'`). Apply to all `/v1/admin/*` routes.

### No traceId on Messages

The chat route (`POST /v1/chat/:agentId`) streams via SSE and doesn't capture or persist the Mastra traceId/runId. The `messages` table has no traceId column. Without this, scores can reference a traceId but there's no way to navigate from a message to its trace.

**Fix:** Store traceId in `messages.content` JSONB via the chat stream's `onFinish` callback. The Mastra agent execution creates an observability span with a traceId that's accessible via the `OtelBridge` — the active OTel span context carries it through `AsyncLocalStorage`. The chat handler needs to read the current trace context after the agent call completes and persist it alongside the message.

This aligns with how Mastra already stores tool results in message content — no schema changes needed.

### Retrieved Chunks are in Message JSONB

Chunks are not stored separately — they're embedded in `messages.content` as `_chunkSources` from the knowledge search tool's response. The scoring job needs to parse this JSONB to extract: response text, user question, and retrieved context chunks.

**Fix:** Create a `extractScoringData(messageContent: JsonValue)` utility that pulls out:
- `responseText` — the agent's final answer
- `chunkSources` — array of retrieved chunks with text, documentId, score
- `userQuestion` — from the preceding user message in the thread

### Score-to-Message Linking

The `scores` table has no `messageId` column. It uses `entityType` + `entityId` as a generic linking pattern.

**Convention:** For message-level scores:
- `entityType: 'message'`
- `entityId: messages.externalId` (the public-facing message ID)
- `threadId` column stores the thread's external ID

This means admin queries joining scores to messages must go through `entityId = messages.externalId` rather than a direct FK. Acceptable trade-off vs modifying Mastra's schema.

### Score Cleanup on Thread Deletion

The `feedback` table has FK cascade deletes to threads and messages. Scores do not — they reference messages via `entityId` (text, no FK). When a thread is deleted, its messages cascade-delete, but scores referencing those messages remain as orphans.

**Fix:** Add a cleanup step to thread deletion:
1. Before deleting the thread, query all message externalIds in the thread
2. Delete all scores where `entityType = 'message'` AND `entityId IN (...)` AND `threadId = ...`
3. Then delete the thread (which cascade-deletes messages and feedback)

Alternatively, add a periodic cleanup job that deletes scores where `entityType = 'message'` and the referenced `entityId` no longer exists in `messages.externalId`. Run daily as part of the retention cron.

### Scoring Kill Switch

If the scoring pipeline needs to be disabled at runtime (rate limit issues, bad scores, queue backup) without a code deploy:

**Fix:** Use the `SCORING_SAMPLE_RATE` env var. Setting it to `0.0` effectively disables scoring. For faster response, also add a `SCORING_ENABLED` boolean env var (default `true`). The scoring job checks this at the start of processing — if `false`, it completes immediately without running scorers.

This also applies to non-prod: disable scoring during maintenance windows or load testing by setting `SCORING_ENABLED=false`.

### Admin Navigation Restructure

Current admin nav: Dashboard, Sync Sources, Documents, Feedback, Queues (5 items).

Adding 6 pages doubles the nav. Group into sections:

| Section | Pages |
|---------|-------|
| **Overview** | Dashboard |
| **Content** | Sync Sources, Documents |
| **Quality** | Reviews (replaces Feedback), Traces, Scorers |
| **Testing** | Datasets, Experiments |
| **Operations** | Queues |

## Build Plan

### Phase 1 — Activate Scoring Engine

**Effort:** 3-4 days

Wire up the 5 RAG scorers to run on every agent response via BullMQ. Includes prerequisite fixes.

#### Tasks

1. **Create `requireAdmin` middleware**
   - Check Better Auth admin role on all `/v1/admin/*` routes
   - Retrofit existing feedback admin endpoint to use it

2. **Capture traceId in chat handler**
   - Hook into `onFinish` callback in the chat stream to capture traceId
   - Store in message metadata or thread context for later lookup

3. **Create `extractScoringData()` utility**
   - Parse message content JSONB to extract response text, chunks, user question
   - Handle edge cases: no chunks (direct answer), multiple tool calls, partial responses

4. **Create `scoring` BullMQ queue and `score-response` job**
   - **Trigger:** explicit `scoringQueue.add()` call in the chat route's `onFinish` callback, after Mastra persists the assistant message. Not a DB trigger — we need access to the traceId from the OTel context at enqueue time.
   - **Payload:** `{ messageId, threadId, agentId, traceId }`
   - **Handler:** fetch message from DB → `extractScoringData()` → run scorers → save scores
   - **Idempotency:** before saving, check if scores already exist for this `entityId` + `scorerId` pair. If the job retries after a partial failure, skip scorers that already have results. Use `jobId: score-${messageId}` to prevent duplicate enqueue.
   - **Retry:** 3 attempts with exponential backoff. Use `UnrecoverableError` for permanent failures (e.g., message not found — may have been deleted between enqueue and processing)
   - **Concurrency:** 5 workers (each job makes 5 LLM calls sequentially)

5. **Configure scoring model and thresholds**
   - Use cheapest viable model per scorer (Haiku-class for tone, Sonnet-class for faithfulness)
   - Define pass/fail thresholds per scorer (configurable via scorer definitions):

   | Scorer | Default Threshold | Below = |
   |--------|------------------|---------|
   | Faithfulness | 0.7 | Response not grounded in context |
   | Hallucination | 0.3 | Likely fabricated information |
   | Answer Relevancy | 0.6 | Didn't address the question |
   | Context Relevance | 0.5 | Retrieved chunks were off-topic |
   | Context Precision | 0.5 | Too much irrelevant context retrieved |

   - Implement sampling via `SCORING_SAMPLE_RATE` env var (default `1.0` = 100%) — tune down if cost is a concern. At Phase 1 launch, sampling is purely random. After Phase 2 adds human annotations, enhance to: always score 100% of negatively-annotated messages regardless of sample rate.

6. **Add scoring env vars to `@typhoon/config`**

   | Variable | Default | Purpose |
   |----------|---------|---------|
   | `SCORING_ENABLED` | `true` | Kill switch — set `false` to disable scoring without code deploy |
   | `SCORING_MODEL` | `claude-haiku-4-5-20251001` | LLM model used for eval scorers (separate from chat agent model) |
   | `SCORING_SAMPLE_RATE` | `1.0` | Fraction of responses to score (0.0-1.0). Below 1.0: random sample + all negatively-rated |
   | `SCORING_CONCURRENCY` | `5` | Max concurrent scoring workers |

7. **Create `score-backfill` one-time job**
   - Read historical threads/messages directly (not via `scoreTraces()` since older messages may lack traceIds)
   - Process in batches of 50, throttle concurrency to 3 to avoid rate limits
   - Skip messages where chunks can't be extracted from content JSONB
   - **One-time cost estimate:** 10K historical messages × 5 scorers = 50K LLM calls ≈ $50 (Haiku) or $500 (Sonnet). Run with Haiku initially — re-score selectively with Sonnet later if needed.

8. **Add missing database indexes** (Drizzle migration)
   - All critical + high priority indexes from Performance section
   - Daily partitioning setup for `ai_spans` — requires raw SQL in migration (Drizzle doesn't natively support `PARTITION BY`)

9. **Fix batch insert loops**
   - Multi-row INSERT for `batchCreateSpans()` and `_doBatchInsertItems()`

10. **Register scoring queue in admin queues page**
    - Scoring job health (depth, failed count, processing time) visible alongside existing sync queue

#### Cost Estimates (per scorer, per response)

| Model Tier | Cost/eval call | 5 scorers x 1K responses/day |
|-----------|---------------|------------------------------|
| Haiku-class | ~$0.001 | ~$5/day |
| Sonnet-class | ~$0.01 | ~$50/day |

### Phase 2 — Conversation Reviewer

**Effort:** 3-4 days

Replace the feedback page with a conversation review console in admin.

#### New Admin Pages

1. **Thread List** (`/reviews`)
   - Paginated table of all conversations (including unscored — don't hide them)
   - Columns: date, user, message count, avg score, worst score, human annotation status
   - Filters: date range, score range, annotation status, user, scored/unscored
   - Sort options: worst-scoring first (default), newest first, unscored first
   - Unscored threads show "—" for score columns and sort to the bottom in worst-scoring view

2. **Thread Detail** (`/reviews/:threadId`)
   - Full message timeline — user questions + agent responses
   - Per-response: retrieved chunks with source document links
   - Per-response: score cards (faithfulness, hallucination, relevancy) with pass/fail badges and reasoning
   - Human annotation panel (see below)

3. **Human Annotation**
   - Structured tags replacing binary thumbs: wrong answer, hallucination, incomplete, wrong source cited, tone issue, correct
   - Optional severity (minor/major/critical)
   - Optional free-text comment
   - Store as scores with `source: 'human'` — unified model with automated scores

#### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/admin/reviews` | GET | Paginated thread list with aggregate scores |
| `/v1/admin/reviews/:threadId` | GET | Thread with messages + scores + annotations |
| `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | POST | Create human annotation on a specific message |
| `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | PATCH | Edit existing annotation (update tags, severity, comment) |
| `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | DELETE | Remove annotation |

#### UI States

Scoring is asynchronous — when viewing a thread, some messages may not have scores yet:

| State | Display |
|-------|---------|
| Scores available | Score cards with pass/fail badges and reasoning |
| Scoring in progress | Spinner or "Scoring..." badge (check if `score-response` job exists for this messageId) |
| Not scored | Grey "Not scored" label (message predates scoring pipeline, or sampling excluded it) |
| Scoring failed | Warning badge with retry option (links to failed job in queues page) |

#### Human Annotation → Score Mapping

Human annotations are stored in the `scores` table using the same schema as automated scores:

| scores column | Human annotation value |
|--------------|----------------------|
| `scorerId` | `'human-review'` |
| `entityType` | `'message'` |
| `entityId` | `messages.externalId` |
| `threadId` | Thread external ID |
| `score` | 1.0 (correct) / 0.0 (wrong) / null (unscored, annotation-only) |
| `reason` | Free-text comment from annotator |
| `metadata` | `{ source: 'human', tags: ['hallucination', 'wrong-source'], severity: 'major', annotatorId: userId }` |
| `resourceId` | Annotator's user ID |

This unifies human and automated scores — queries like "show me all messages scored below 0.5 by any source" work across both.

**Concurrent annotation:** One annotation per message per annotator. If admin A and admin B both annotate the same message, two score records are created (differentiated by `metadata.annotatorId`). The PATCH endpoint updates only the caller's annotation. The dashboard aggregates all human annotations — if two annotators disagree, both are visible on the thread detail page.

#### Score Version Tracking

When a scorer definition changes, old scores become stale. Track this by storing the scorer version in the `scorer` JSONB field:

```json
{ "scorerId": "faithfulness", "version": 3, "model": "claude-haiku-4-5-20251001" }
```

The dashboard can then filter by scorer version — "show only scores from the current version" or "compare scores across versions." Old scores are never deleted (they're still valid for the scorer version that produced them), but the UI defaults to showing the latest version.

#### Migration Path for Existing Feedback

- **Phase 2:** Keep existing `feedback` table for desk/widget (end-user thumbs up/down). Admin annotations use `scores` table.
- **Phase 3:** Dashboard reads from both — positive/negative feedback counts alongside automated score trends.
- **Future:** Migrate desk/widget feedback to the scores model (thumbs up = `score: 1.0, scorerId: 'end-user'`; thumbs down = `score: 0.0`). Deprecate `feedback` table. Not in scope for this plan — requires desk UI changes.

### Phase 3 — Analytics Dashboard

**Effort:** 2-3 days

Replace the two feedback counters with real analytics.

#### Dashboard Widgets

| Widget | Data Source | Query Pattern |
|--------|-----------|---------------|
| Score distributions over time | `scores` GROUP BY date, scorerId | Line chart |
| Hallucination rate (7-day trend) | `scores` WHERE scorerId = 'hallucination' | Sparkline |
| Worst-scoring threads (bottom 10) | `scores` JOIN `threads` ORDER BY avg ASC | Table |
| Human vs automated agreement | Compare human annotations to automated scores on same messages | Correlation chart |
| Per-document quality | `scores` → `messages` → chunks → `documents` | Table with drill-down |
| Per-user quality | Aggregate scores by resourceId | Table |
| Response latency (p50/p95/p99) | `ai_spans` WHERE spanType = 'agent' | Percentile chart |
| Token usage / estimated cost | `ai_spans` attributes (model, tokens in/out) | Bar chart |

#### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/admin/dashboard/scores` | GET | Score summary over time (powers line chart, sparklines). Params: `dateFrom`, `dateTo`, `scorerId` |
| `/v1/admin/dashboard/threads` | GET | Worst-scoring threads. Params: `limit`, `dateFrom`, `dateTo` |
| `/v1/admin/dashboard/documents` | GET | Per-document quality. Params: `limit`, `dateFrom`, `dateTo` |
| `/v1/admin/dashboard/users` | GET | Per-user quality. Params: `limit`, `dateFrom`, `dateTo` |
| `/v1/admin/dashboard/latency` | GET | Response latency percentiles. Params: `dateFrom`, `dateTo` |
| `/v1/admin/dashboard/cost` | GET | Token usage and estimated cost. Params: `dateFrom`, `dateTo` |

All dashboard routes read from materialized views or Redis cache — never live aggregation on raw tables.

#### Widget Implementation Notes

**Per-document quality** is the most complex widget — requires multi-hop extraction:
1. Query `scores` for low-scoring messages (`entityType = 'message'`, `score < threshold`)
2. Fetch each message's content JSONB from `messages`
3. Parse `_chunkSources` from tool output to extract `documentId` references
4. Aggregate score by documentId → JOIN with `documents` for title/source

This is too expensive for live queries. Pre-compute via materialized view or background job (see below).

#### Materialized Views

| View | Schema | Refresh |
|------|--------|---------|
| `score_daily_summary` | `date, scorer_id, scorer_version, avg_score, min_score, count, fail_count` | Every 15 min |
| `thread_score_summary` | `thread_id, avg_score, worst_score, worst_scorer_id, score_count, human_annotation_count, last_scored_at` | Every 15 min (also updated inline by scoring job for freshness) |
| `document_quality_summary` | `document_id, avg_score, hallucination_rate, total_references, last_referenced_at` | Every hour (expensive — JSONB extraction) |

#### Performance Strategy

- Materialized views for heavy aggregations, refreshed via BullMQ scheduled job (intervals above)
- Redis cache (5-min TTL) for dashboard API responses
- Default time window: last 30 days (prevents full table scans)
- `thread_score_summary` is also updated inline by the scoring job on completion (write-through) for near-real-time accuracy on the reviews list page

### Phase 4 — Datasets & Experiments

**Effort:** 3-4 days

Expose the existing dataset/experiment infrastructure in admin. This infrastructure also powers Eval CI (golden dataset validation) and post-sync document quality checks — the admin UI and CI share the same experiment runner and results storage.

#### New Admin Pages

1. **Dataset Manager** (`/datasets`)
   - Create/edit datasets with test cases (input question + expected output + context)
   - Version management (SCD-2 already implemented in storage)
   - Import/export as JSON

2. **Experiment Runner** (`/experiments`)
   - Select dataset + agent config → run all test cases → score results
   - Progress tracking (pending/running/completed/failed status already in schema)
   - Per-item results: input, expected output, actual output, scores, pass/fail

3. **Experiment Comparison** (`/experiments/compare`)
   - Side-by-side diff of two runs on the same dataset
   - Score deltas per item and aggregate
   - Regression detection: flag when a new run scores worse than previous

#### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/admin/datasets` | GET, POST | List/create datasets |
| `/v1/admin/datasets/:id` | GET, PATCH, DELETE | Dataset CRUD |
| `/v1/admin/datasets/:id/items` | GET, POST | Manage test cases |
| `/v1/admin/experiments` | GET, POST | List/trigger experiments |
| `/v1/admin/experiments/:id` | GET | View results |
| `/v1/admin/experiments/:id/results` | GET | Per-item results |
| `/v1/admin/experiments/compare` | GET | Side-by-side comparison. Params: `a` (experiment ID), `b` (experiment ID). Must share the same dataset. |

#### Experiment Execution Model

Running an experiment means calling the agent for every dataset item and scoring the results. This is expensive.

**Agent configuration** for an experiment run:
- Which agent to test (currently only `supervisor`, but extensible)
- Which model override to use (e.g., test Sonnet vs Haiku on the same dataset)
- Optional system prompt override (test prompt variations)
- Which scorers to run (defaults to all published)

Stored in `experiments.metadata` JSONB — no schema change needed.

**Execution flow:**
1. Admin selects dataset + agent configuration → `POST /v1/admin/experiments`
2. API creates experiment record (status: `pending`) and enqueues a `run-experiment` BullMQ job
3. Job iterates dataset items:
   - Sends each item's `input` to the agent as a chat message
   - Captures agent response + retrieved chunks
   - Runs all active scorers against the response
   - Saves result to `experiment_results` (input, output, groundTruth, scores, traceId)
   - Updates experiment counters (succeeded, failed, skipped)
4. On completion: experiment status → `completed`

**Cost and resource implications:**

| Dataset size | Agent calls | Scorer calls (5 per response) | Est. time (sequential) | Est. cost (Haiku eval + Sonnet agent) |
|-------------|------------|-------------------------------|----------------------|---------------------------------------|
| 20 items | 20 | 100 | ~5 min | ~$0.50 |
| 100 items | 100 | 500 | ~25 min | ~$2.50 |
| 500 items | 500 | 2,500 | ~2 hours | ~$12.50 |

**Concurrency:** Process 3 dataset items in parallel (limited by LLM rate limits). Each item is independent.

**Failure handling:** Individual item failures don't abort the experiment — record error in `experiment_results.error`, increment `failedCount`, continue.

**Cancellation:** Admin can cancel a running experiment via `DELETE /v1/admin/experiments/:id` or a dedicated cancel action. The job checks experiment status before processing each item — if status changed to `failed` (cancelled), it stops processing remaining items and updates counters. Uses BullMQ's `job.moveToFailed()` for clean shutdown.

#### CLI Entry Points (Eval CI)

The experiment infrastructure is shared between admin UI and CI. Add CLI scripts:

```bash
bun run eval:scorers    # Scorer validation against golden dataset
bun run eval:agent      # Agent quality against golden dataset
bun run eval:all        # Both (nightly)
```

These use the same `run-experiment` job handler — just triggered programmatically instead of via admin UI. Exit non-zero if quality thresholds are not met. See Testing Strategy > Eval CI for full details.

#### Golden Dataset Seeding

Phase 4 includes creating the initial golden datasets:

| Dataset | Source | Items |
|---------|--------|-------|
| `datasets/golden/scorer-validation.json` | Hand-crafted known-good and known-bad response pairs | 30-50 |
| `datasets/golden/agent-quality.json` | Sampled from production threads + human-verified expected quality | 20-50 |

These are checked into the repo and maintained like code. At eval CI runtime, the CLI script imports the JSON file into the database as a dataset (if not already present or if the file has changed), then runs the experiment against it. The repo JSON file is the source of truth — the DB dataset is a runtime copy.

#### Feedback-to-Training Loop

Human annotations on bad responses can auto-create dataset items:
- Annotator marks response as "wrong answer" with correction
- System creates a dataset item: input = original question, groundTruth = corrected answer
- Next experiment run automatically tests whether the fix worked
- Validated items can be promoted into the golden dataset after human review

### Phase 5 — Trace Explorer

**Effort:** 2-3 days

Expose `ai_spans` data for debugging agent behavior.

#### New Admin Page

1. **Trace List** (`/traces`)
   - Filterable by: agent, time range, duration, status, entity type
   - Columns: traceId, agent, start time, duration, span count, status
   - **Status** is derived from spans: `success` (all spans completed), `error` (any span has error), `partial` (root span completed but child spans missing/incomplete)

2. **Trace Detail** (`/traces/:traceId`)
   - Nested span tree (waterfall view): agent → model call → tool use → retrieval → embedding
   - Per-span: input/output, token counts, model used, duration, error
   - Link to conversation reviewer (click through via threadId)
   - Link to associated scores

#### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/admin/traces` | GET | List traces with filters |
| `/v1/admin/traces/:traceId` | GET | Full span tree |

#### Scaling Note

This page queries `ai_spans` directly. With Option 1 (PostgreSQL), ensure indexes on `(entity_type, started_at)` and `(thread_id)`. When migrating to Option 4 (ClickHouse), this is the primary page that benefits.

### Phase 6 — Scorer Management

**Effort:** 1-2 days

Admin-configurable scoring without code changes.

#### New Admin Page

1. **Scorer List** (`/scorers`)
   - All scorer definitions with status (draft/published)
   - Version history per scorer
   - Enable/disable individual scorers without deleting them

2. **Scorer Editor** (`/scorers/:id`)
   - Edit: model, instructions, score range, sampling rate
   - Version control with change messages
   - Preview: test scorer against a sample message (paste a response + context, run scorer, see result)

#### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/v1/admin/scorers` | GET, POST | List/create scorer definitions |
| `/v1/admin/scorers/:id` | GET, PATCH, DELETE | Scorer CRUD |
| `/v1/admin/scorers/:id/versions` | GET | Version history |
| `/v1/admin/scorers/:id/preview` | POST | Test scorer against sample data |

#### Scorer Definition → Runtime Scorer

The scoring BullMQ job needs to load scorer configs from the database at runtime (not hardcoded):

1. **On startup and periodically (every 5 min):** Worker fetches all published scorer definitions from `scorer_definitions` table
2. **Constructs Mastra scorers** from the definition fields:

   | Definition field | Maps to |
   |-----------------|---------|
   | `type: 'prebuilt'` | Lookup in `@mastra/evals/scorers/prebuilt` by name (e.g., `faithfulness`) |
   | `type: 'custom'` | Create custom scorer using `instructions` as the LLM-as-judge prompt |
   | `model` | LLM model ID for the scorer (overrides `SCORING_MODEL` env var) |
   | `scoreRange` | Min/max score values and pass/fail threshold |
   | `defaultSampling` | Probability of scoring a given message (overrides `SCORING_SAMPLE_RATE`) |

3. **Caches in memory** — avoids DB read per scoring job
4. **Cache invalidation:** When admin publishes/updates a scorer definition, enqueue a `reload-scorers` event (or use a simple TTL refresh)

The 5 initial RAG scorers from `packages/agents/src/evals/scorers.ts` become the seed data — inserted into `scorer_definitions` on first run via a migration or seed script.

## Beyond Langfuse

Capabilities only possible because we own the full stack:

| Feature | Why External Tools Can't | Implementation |
|---------|------------------------|----------------|
| **Per-document quality scores** | No knowledge of our S3 documents or chunk pipeline | JOIN scores → messages → chunks → documents |
| **Source gap analysis** | No concept of our knowledge base | Identify questions with low scores + no relevant chunks → content gap |
| **RAG pipeline debugging** | See retrieval as a generic span | Show: query → embedding → chunks → relevance → answer → faithfulness |
| **Real-time scoring alerts** | Post-hoc only | Score inline via BullMQ, surface warnings to reps ("response may be inaccurate") |
| **Cross-domain analytics** | Can't query sync targets, documents, queues | "Docs from sync source X have 40% hallucination rate" |
| **Rep performance** | No rep/user model | Quality metrics per rep, per customer, per topic |
| **Feedback-to-training loop** | Store feedback but can't act on it | Human annotations → dataset items → experiment regression tests |
| **Custom domain scorers** | Generic scoring only | "Did it cite the correct policy?", "Did it follow company tone?" |

## Future Enhancements (Not in Scope)

Features identified during planning that are worth tracking but not part of the initial build:

| Feature | Description | Trigger to Build |
|---------|-------------|-----------------|
| **Real-time scoring alerts** | Surface "response may be inaccurate" warnings to reps in desk when a score falls below threshold | When scoring pipeline is stable and latency is predictable (Phase 1 complete + 2 weeks of production data) |
| **Score export** | CSV/JSON export of scores, annotations, experiment results for external analysis | First request from a stakeholder who needs data outside admin |
| **Annotation assignment** | Assign threads to specific reviewers, track review completion | When review team grows beyond 1-2 people |
| **Bulk annotation** | Mark multiple threads/messages at once | When annotation volume makes individual review impractical |
| **Notification on quality degradation** | Webhook/email when hallucination rate exceeds threshold over a rolling window | After Phase 3 dashboard is live and baseline metrics are established |
| **Desk feedback → scores migration** | Unify end-user thumbs up/down into the scores model, deprecate `feedback` table | When annotation workflows are proven and desk UI is ready for changes |
| **Custom domain scorers** | "Did it cite the correct policy?", "Did it follow company tone?" | When generic RAG scorers are running and domain-specific quality gaps are identified |
| **Scoring pipeline health dashboard** | Dedicated view: scores created/day, scorer error rates, avg scoring latency, queue depth trend | After Phase 3 — fold into analytics dashboard or queues page |
| **Re-score on scorer update** | When a scorer definition is updated, optionally re-score recent messages with the new version | When scorer iteration is frequent and version comparison is needed |
| **End-user score visibility** | Show confidence indicators to end users in widget ("this answer may need verification") | When scoring latency is low enough for near-real-time display (<30s) |

## Testing Strategy

### Unit Tests

Every new source file gets a co-located `*.test.ts` (per CLAUDE.md quality gates):

| Component | What to Test |
|-----------|-------------|
| `extractScoringData()` utility | Parse message JSONB → response text, chunks, user question. Edge cases: no chunks, multiple tool calls, empty content |
| `requireAdmin` middleware | Allow admin role, reject rep role, reject unauthenticated |
| Admin API routes | Request validation, pagination, filtering, error responses |
| Scoring job handler | Happy path, missing message, extraction failure, scorer failure |
| Partition management job | Create future partitions, drop expired, respect retention config |
| Dashboard aggregation queries | Correct grouping, date filtering, score math |

### Integration Tests

Run against PostgreSQL (requires `DATABASE_URL`):

| Test | What it Verifies |
|------|-----------------|
| Score persistence round-trip | Save score → list by entity → verify data integrity |
| Thread + scores JOIN | Aggregate scores per thread, verify denormalized columns update |
| Partition management | Create/drop daily partitions on `ai_spans`, verify data isolation |
| Experiment execution | Create dataset → run experiment → verify results and counters |

### Mocking Scorers in Code CI

LLM-based scorers can't run in code CI (non-deterministic, expensive). Strategy:

- **Unit tests:** Mock the scorer — `vi.mock()` the Mastra scorer to return a fixed `{ score: 0.85, reason: 'test' }`. Tests verify the pipeline (extraction → scoring → storage), not the scorer's judgment.
- **Integration tests:** Use a deterministic scorer that returns `score = responseText.length > 0 ? 1.0 : 0.0`. Verifies DB round-trip without LLM calls.
- **E2E tests:** Same deterministic scorer. Real LLM scoring is validated via Eval CI (below).

### Eval CI (Offline Evals)

Code CI validates that the plumbing works. Eval CI validates that the **outputs are good** — scorer accuracy, agent response quality, and prompt regression detection.

#### Golden Dataset

A curated, human-annotated dataset that serves as ground truth. Two types:

**1. Scorer validation dataset** — validates that scorers score correctly:

| Item | Contains | Purpose |
|------|----------|---------|
| Known-good response | Question + context + faithful response + expected scores (faithfulness ≥ 0.8, hallucination ≤ 0.2) | Assert scorers recognize good answers |
| Known-bad: hallucination | Question + context + fabricated response + expected scores (hallucination ≥ 0.7) | Assert hallucination scorer catches it |
| Known-bad: irrelevant | Question + context + off-topic response + expected scores (relevancy ≤ 0.3) | Assert relevancy scorer catches it |
| Known-bad: unsupported | Question + context that doesn't contain the answer + response that answers anyway | Assert faithfulness scorer catches it |
| Edge case: partial | Question + partial context + partially correct response | Assert scorers produce mid-range scores, not extremes |

Target: 30-50 items covering each scorer's detection capability. Maintained in `datasets/golden/scorer-validation.json` (checked into repo).

**2. Agent quality dataset** — validates that the agent produces good responses:

| Item | Contains | Purpose |
|------|----------|---------|
| Question + context documents + expected answer quality | `{ input, context, groundTruth, minScores: { faithfulness: 0.7, relevancy: 0.6 } }` | Assert agent responses meet quality thresholds |

Target: 20-50 items covering common question types, edge cases, and known failure modes. Grows over time from human annotations (feedback-to-training loop). Maintained in `datasets/golden/agent-quality.json`.

#### When Eval CI Runs

| Trigger | What runs | Why |
|---------|----------|-----|
| **Prompt change** (agent system prompt, tool descriptions) | Agent quality dataset | Catch regressions from prompt edits |
| **Scorer change** (scorer definition, instructions, model) | Scorer validation dataset | Verify scorer still detects what it should |
| **Model change** (agent model or scoring model version) | Both datasets | New model version may behave differently |
| **Nightly schedule** | Both datasets | Catch drift even without code changes (model provider updates, context changes) |
| **Manual trigger** | Either or both | Ad-hoc validation before deploying changes |

#### How It Works

```
eval-ci job (BullMQ or CLI script):
  1. Load golden dataset (scorer-validation or agent-quality)
  2. For each item:
     a. If scorer validation: run scorer against pre-defined input/output → compare score to expected range
     b. If agent quality: send question to agent → score response → compare to minimum thresholds
  3. Generate report:
     - Per-item: actual vs expected scores, pass/fail
     - Aggregate: pass rate, avg score delta from baseline, worst regressions
  4. Fail CI if:
     - Pass rate drops below threshold (default: 90%)
     - Any individual score deviates more than 0.3 from expected
     - Any scorer fails to detect a known-bad case
```

This reuses the Phase 4 experiment infrastructure — eval CI is just an experiment run triggered from CLI instead of admin UI. The `run-experiment` BullMQ job and `experiment_results` table are the same.

#### CLI Entry Point

```bash
# Run scorer validation
bun run eval:scorers

# Run agent quality check
bun run eval:agent

# Run both (nightly)
bun run eval:all

# Run against specific dataset
bun run eval --dataset datasets/golden/scorer-validation.json
```

These scripts:
1. Create an experiment record programmatically
2. Execute via the same `run-experiment` job handler
3. Print a pass/fail summary to stdout
4. Exit with non-zero code if thresholds are not met (CI fails)

#### Cost Control

| Dataset | Items | Agent calls | Scorer calls | Est. cost | Est. time |
|---------|-------|------------|--------------|-----------|-----------|
| Scorer validation (30 items) | 30 | 0 (pre-defined responses) | 150 | ~$0.15 (Haiku) | ~2 min |
| Agent quality (20 items) | 20 | 20 | 100 | ~$1.50 (Sonnet agent + Haiku eval) | ~5 min |
| **Nightly total** | 50 | 20 | 250 | **~$1.65** | ~7 min |

Scorer validation is cheap (no agent calls — responses are pre-defined in the dataset). Agent quality is more expensive but the dataset is small.

#### Non-Determinism Handling

LLM outputs are non-deterministic. Strategy:

- **Score ranges, not exact values.** Assert `faithfulness >= 0.7`, not `faithfulness == 0.85`. Allow ±0.15 tolerance.
- **Retry flaky items once.** If a single item fails by a small margin, retry it before failing CI. If it fails twice, it's a real regression.
- **Track variance over time.** Store eval results in `experiment_results` — the nightly runs build a history. If variance on an item increases, the scorer or agent is becoming unstable.
- **Temperature 0 for evals.** Set `temperature: 0` on both the agent and scorer models during eval runs to minimize variance.

#### Maintaining the Golden Dataset

The golden dataset is only useful if it reflects real usage:

1. **Seed from production annotations** (Phase 2 feedback-to-training loop) — when a human annotates a bad response with a correction, it becomes a golden dataset candidate
2. **Review quarterly** — remove stale items (questions about deprecated features), add items for new failure modes
3. **Version alongside code** — golden datasets are checked into the repo, changes are reviewed in PRs like any other code change
4. **Never auto-generate** — every golden dataset item must have human-verified expected scores

### Quality Gates Pipeline

Three layers of quality gates, from earliest (cheapest) to latest (most realistic):

```
Developer makes change (local)
  │
  ├─ Pre-commit (lefthook) ─── biome check, tsc ──────────────── seconds, free
  │
  ├─ Code CI (every push) ──── unit tests, integration tests ─── minutes, free
  │                            mocked scorers, type checks
  │
  ├─ Eval CI (on PR) ───────── golden dataset with real LLM ──── ~7 min, ~$1.65
  │                            ONLY if quality-affecting files changed
  │                            blocks merge if pass rate < 90%
  │
  ├─ Merge to main
  │
  ├─ Deploy to non-prod ────── eval CI runs against non-prod ─── ~7 min, ~$1.65
  │                            mandatory gate before prod promote
  │
  ├─ Promote to production
  │
  └─ Production monitoring ─── every response scored (Phase 1) ── ongoing, $$
```

**Environments:** local → non-prod → production. No canary capability. Non-prod is the last validation gate — eval CI runs there against real infrastructure before promoting to prod.

#### PR-Level Eval Trigger

Not every PR needs eval CI — only changes that affect output quality. Trigger file patterns:

| Pattern | Risk | Eval suite |
|---------|------|------------|
| `packages/agents/src/**/*.ts` | Agent behavior, tools, system prompt | `eval:agent` |
| `packages/agents/src/evals/**` | Scorer logic | `eval:scorers` |
| `**/scorer-definitions*` | Scorer config | `eval:scorers` |
| `packages/ingestion/**` | Chunk pipeline (retrieval quality) | `eval:agent` |
| `package.json`, `bun.lock` | Dependency changes (Mastra, AI SDK) | `eval:all` |
| `datasets/golden/**` | Golden dataset itself changed | `eval:all` (validate new baselines) |

Implement as a GitHub Actions workflow with path filters. Skip eval CI for changes that only touch admin UI, docs, or infra.

#### Pre-Promote Gate (Non-Prod → Prod)

After deploying to non-prod, before promoting to production:
1. Eval CI runs automatically against non-prod (real environment, real model calls, real DB)
2. Promotion to prod is blocked until eval CI passes
3. If eval CI fails, the promotion is held and the team is notified
4. Can be overridden with explicit approval (escape hatch for urgent fixes)

Running in non-prod rather than in CI gives higher confidence — it validates the actual deployed artifact with real infrastructure, not just the code against mocked services.

#### Admin UI Change Protection

Scorer definitions live in the database (Phase 6) — changes bypass all CI. Two safeguards:

**Automatic validation on publish:** When an admin publishes a new scorer version, the system auto-runs the scorer validation golden dataset against the new version before activating it. If pass rate drops below threshold:
- Block the publish
- Show a comparison: "Version 3 detected 8/10 hallucination cases. Version 4 only detected 5/10. Publish anyway?"
- Admin can override with acknowledgment

**Audit trail:** All scorer definition changes are logged with `changedFields`, `changeMessage`, and `authorId` (already in versioned schema). The dashboard shows when scorer definitions last changed alongside score trend charts — makes it visible if a scorer change caused a quality shift.

#### Post-Sync Document Quality Check (Phase 3)

Source document changes in S3 don't trigger code CI. Built as part of Phase 3 (analytics dashboard) since it depends on the scoring pipeline (Phase 1) and the document quality materialized view.

After a document sync completes:

1. Identify threads that previously referenced the updated document (via `_chunkSources` in message JSONB)
2. Re-score the last N responses that used chunks from this document (N = 10-20)
3. Compare new scores to original scores
4. If avg score drops > 0.2, flag in admin dashboard: "Document X update may have degraded response quality"

This is a lightweight background job hooked into the existing sync pipeline — not blocking the sync, but surfacing regressions that would otherwise go unnoticed until a user complains.

### E2E Tests

Run against full stack (`bun run docker:up`):

| Test | Flow |
|------|------|
| Scoring pipeline | Send chat message → verify score-response job enqueued → verify scores created |
| Conversation reviewer | Navigate admin → reviews list → click thread → verify scores displayed |
| Human annotation | Open thread detail → submit annotation → verify score created with `source: human` |

## Performance & Scalability

### Existing Query Performance Issues

Issues found in current Mastra storage implementations that need to be addressed:

#### Critical

1. **`listMessages()` loads all rows into memory** (`packages/pg/src/storage/memory.ts`)
   - Fetches every message in a thread, paginates in JavaScript
   - A thread with 10K messages loads all 10K rows to show page 1
   - Fix: override with LIMIT/OFFSET in SQL, or fix upstream in Mastra

2. **`updateMessages()` is N+1** (`packages/pg/src/storage/memory.ts`)
   - Loop with individual SELECT + UPDATE per message
   - 100 messages = 200 queries
   - Fix: batch upsert or dynamic SQL UPDATE with CASE/WHEN

3. **Batch inserts are loops** (`packages/pg/src/storage/observability.ts`, `packages/pg/src/storage/datasets.ts`)
   - `batchCreateSpans()` and `_doBatchInsertItems()` loop individual INSERTs inside a transaction
   - Fix: multi-row `INSERT INTO ... VALUES (...), (...)`

#### Missing Indexes

| Priority | Index | Reason |
|----------|-------|--------|
| Critical | `experiments(created_at)` | listExperiments orders by it — full table scan without |
| Critical | `datasets(created_at)` | Same — full table scan on pagination |
| Critical | `scores(entity_id, entity_type)` | listScoresByEntityId has no covering index |
| High | `ai_spans(parent_span_id)` | getRootSpan: `WHERE parent_span_id IS NULL` |
| High | `ai_spans(thread_id)` | Conversation reviewer: "show trace for this thread" |
| High | `ai_spans(started_at)` | Time-range filtering, retention job, partition pruning |
| High | `experiment_results(experiment_id, created_at)` | Filtered + ordered listing |
| Medium | `dataset_items(dataset_id, is_deleted)` | Soft deletes accumulate without filtering |
| Medium | `experiments(status)` | Common filter |

#### No Pre-Computed Aggregates

The codebase has zero materialized views or summary tables. Every dashboard query will be a live aggregation. Addressed in Phase 3.

### PostgreSQL Growth Projections

| Scale | Responses/day | Spans/day | Scores/day | ai_spans/year | Action Needed |
|-------|--------------|-----------|------------|---------------|---------------|
| Low | 100 | 500-1,500 | 500 | ~500K | None |
| Medium | 1,000 | 5K-15K | 5,000 | ~5M | Indexes + materialized views |
| High | 10,000 | 50K-150K | 50,000 | ~50M | Partition + retention + read replicas |
| Limit | | | | ~100M+ | Migrate ai_spans to ClickHouse (Option 4) |

### Mitigation Strategies

| Strategy | When | Implementation |
|----------|------|----------------|
| Missing indexes migration | Phase 1 | Drizzle migration adding all indexes listed above |
| Daily partitioning on `ai_spans` | Phase 1 | `PARTITION BY RANGE (started_at)` with daily intervals |
| Configurable span retention | Phase 1 | Env var `SPAN_RETENTION_DAYS` (default 90) — BullMQ cron drops expired partitions + creates future partitions |
| Fix batch insert loops | Phase 1 | Multi-row INSERT for `batchCreateSpans()` and `_doBatchInsertItems()` |
| Denormalized scores on threads | Phase 2 | `avg_score`, `worst_score`, `last_scored_at` columns — updated by scoring job |
| Materialized views for dashboards | Phase 3 | `score_daily_summary`, `thread_score_summary` — refreshed every 5-15 min via BullMQ |
| Redis cache for dashboard | Phase 3 | 5-min TTL on dashboard API responses |
| ClickHouse migration | Future | Swap `DrizzleObservabilityStorage` implementation — storage interface is already isolated |

#### Why Daily Partitioning

With retention, only whole partitions can be dropped:
- **Monthly** = keep 3-4 months (current month can't drop) — wastes up to 30 days of storage
- **Weekly** = drop at 7-day granularity — acceptable but imprecise
- **Daily** = drop exactly N days — precise retention, instant `DROP TABLE` per partition

Partition count concern is overstated for modern PostgreSQL (12+). With 90-day retention you have ~90 active partitions — well within PostgreSQL's comfort zone (issues start at 1000+). Partition pruning is on by default: `WHERE started_at > now() - interval '7 days'` prunes to exactly 7 partitions regardless of total count. Smaller partitions also mean faster autovacuum cycles.

Requires a BullMQ cron job for partition management (create future partitions, drop expired ones) — already needed for retention regardless.

#### Configurable Retention

Add to `@typhoon/config` env schema:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SPAN_RETENTION_DAYS` | `90` | Days to keep ai_spans data before partition drop |
| `SCORE_RETENTION_DAYS` | `0` (forever) | Days to keep scores — 0 means no expiry |

The BullMQ retention cron job reads these values and drops/deletes accordingly. Scores default to forever (small, high-value data). Spans default to 90 days (large, ephemeral data). Operators can tune both without code changes.

### Eval Scoring Cost

| Volume | Responses/day | Eval LLM calls/day | Haiku-class | Sonnet-class |
|--------|--------------|--------------------|-----------------------------|------------------------------|
| Low | 100 | 500 | ~$0.50/day | ~$5/day |
| Medium | 1,000 | 5,000 | ~$5/day | ~$50/day |
| High | 10,000 | 50,000 | ~$50/day | ~$500/day |

Mitigations: sample scoring (20% random + 100% of negatively-rated), cheapest model per scorer, async via BullMQ.

## Total Effort

| Phase | What | Effort | Dependencies |
|-------|------|--------|-------------|
| 1 | Activate scoring engine + perf fixes | 3-4 days | None |
| 2 | Conversation reviewer | 3-4 days | Phase 1 |
| 3 | Analytics dashboard | 2-3 days | Phase 1 + Phase 2 (thread denormalization) |
| 4 | Datasets & experiments | 3-4 days | Phase 1 |
| 5 | Trace explorer | 2-3 days | None (can start alongside Phase 1) |
| 6 | Scorer management | 1-2 days | Phase 1 |
| **Total** | | **~15-20 days** | |

**Dependency graph:**
```
Phase 1 (scoring engine) ──┬── Phase 2 (reviewer) ── Phase 3 (dashboard)
                           ├── Phase 4 (datasets/experiments)
                           └── Phase 6 (scorer management)
Phase 5 (trace explorer) ── independent, can start anytime
```

**Critical path:** Phase 1 → Phase 2 → Phase 3 = ~9-11 days to core functionality (scoring + review + analytics). Phases 4-6 can trail.

### Success Criteria

| Phase | Done when |
|-------|-----------|
| 1 | Every agent response produces 5 scores in the `scores` table within 60s. Backfill completes without errors. Scoring queue visible in admin. Kill switch works. |
| 2 | Admin can browse threads, see scores per message, submit/edit/delete annotations. Unscored and in-progress states render correctly. |
| 3 | Dashboard loads in <2s with 30-day window. All 8 widgets populated. Materialized views refreshing on schedule. Post-sync quality check fires after document sync. |
| 4 | Admin can create datasets, run experiments, compare two runs. `bun run eval:scorers` and `bun run eval:agent` exit 0 against golden datasets. |
| 5 | Admin can list traces, view span waterfall, click through to thread. Filtered queries return in <1s with 90-day data. |
| 6 | Admin can edit scorer definitions, publish new versions, preview against sample data. Published changes are picked up by scoring workers within 5 min. |
