# Phase 4 — Implementation Notes

Notes from Phase 4 (Datasets & Experiments) implementation. Reference for future phases.

## Existing Infrastructure, No New Migrations

The master plan describes datasets, dataset items, experiments, and experiment results tables — all of these already existed in the database schema (`packages/db/src/schema/datasets.ts`, `experiments.ts`) with full storage layer implementations (`packages/pg/src/storage/datasets.ts`, `experiments.ts`). Phase 4 added zero migrations. The work was purely API routes, worker logic, and admin UI.

The storage classes (`DrizzleDatasetsStorage`, `DrizzleExperimentsStorage`) were already instantiated inside `PostgresStore` but not exported from `@typhoon/pg`. We added direct exports so API routes can instantiate them with the shared `sql` client rather than going through Mastra's storage abstraction.

## Date Serialization Bug in Storage Layer

The pre-existing storage classes passed `new Date()` objects as parameters to `sql.unsafe()`. The `postgres` library's `unsafe()` method cannot serialize Date objects in its parameter binding — it throws `TypeError: The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Date`.

This bug was latent because the storage methods were only exercised by integration tests (which may use a different postgres client configuration) and by Mastra internals (which may handle dates differently). Calling them from API routes via `sql.unsafe()` exposed the issue.

**Fix:** All `new Date()` params in `datasets.ts` and `experiments.ts` storage classes were replaced with `new Date().toISOString()`. Dynamic update methods (`updateExperiment`, `_doUpdateDataset`, `updateExperimentResult`) added `v instanceof Date ? v.toISOString() : ...` guards. The experiment job handler uses an `isoNow()` helper that returns ISO strings instead of Date objects.

## Experiment Queue Initialization

The experiments BullMQ queue must be initialized in **both** the API process and the worker process:

- **API** (`apps/api/src/index.ts`): `initQueue('experiments', redisUrl)` — needed so `getQueue('experiments')` works when the POST `/v1/admin/experiments` handler enqueues a job
- **Worker** (`apps/worker/src/index.ts`): `initExperimentQueue(redisUrl)` — needed so the BullMQ `Worker('experiments', ...)` can connect

Missing the API-side initialization caused enqueued jobs to silently fail (the `try/catch` in the route handler swallowed the "queue not initialized" error). This was caught during manual verification.

## Experiment Agent — No Memory, No Guardrails

The experiment worker calls the supervisor agent to generate responses for each dataset item. The production supervisor requires `MastraMemory` (for conversation persistence) and has guardrails (prompt injection, moderation, PII detection).

For experiments, we created `createExperimentAgent()` in `packages/agents/src/experiment-agent.ts` that builds the supervisor without memory or guardrails:

- **No memory** — each dataset item is independent; persisting to threads/messages would pollute production data
- **No guardrails** — experiments test raw agent quality without interference from safety filters
- **No `setThreadTitle` tool** — not relevant for evaluation

The experiment agent uses the same `createChatModel()`, `SUPERVISOR_INSTRUCTIONS`, and `createKnowledgeSearchTool()` as the production agent, so it tests the same behavior.

## Concurrency Model

Experiments process 3 dataset items concurrently using a manual semaphore pattern (not `Promise.all` which would launch all at once). The concurrency limit prevents LLM rate limit issues.

The BullMQ experiment worker itself has `concurrency: 1` — only one experiment runs at a time. This is intentional: experiments are expensive (many LLM calls) and running multiple simultaneously would compete for rate limits. The worker has a 30-minute lock duration with periodic `job.extendLock()` calls after each item to prevent BullMQ from marking long-running experiments as stalled.

## Cancellation

Admin can cancel a running experiment via `DELETE /v1/admin/experiments/:id`. The route sets the experiment's status to `failed` in the database. The worker checks the experiment status before processing each item — if status changed to `failed`, it stops processing remaining items and sets `cancelled: true`.

This is a cooperative cancellation pattern — there's no way to abort in-progress LLM calls. The worst case is completing 3 items (the current concurrent batch) before stopping.

## Scoring in Experiments

Experiment scores are stored in `experiment_results.output` JSONB alongside the agent's response text — NOT in the main `scores` table. This keeps experiment data isolated from production scoring data.

Currently only `answerRelevancy` runs during experiments because the experiment agent doesn't expose the retrieved chunks needed for context-dependent scorers (faithfulness, hallucination, contextRelevance, contextPrecision). Adding chunk extraction from agent responses would enable all 5 scorers.

## Compare Route Ordering

The `/v1/admin/experiments/compare` route must be registered **before** `/v1/admin/experiments/:id` in the routes array. Otherwise, Hono matches `compare` as an `:id` parameter value. The same applies in TanStack Router — `experimentCompareRoute` is registered before `experimentDetailRoute` in `layoutRoute.addChildren()`.

## API Response → UI Transformation

The comparison API returns a flat structure (`aggregate.improvementCount`, `items[].resultA/resultB/scoreDelta`) while the UI component expects a different shape (`summary.improvements`, `items[].scoreA/scoreB/delta`). Rather than changing the API (which has a clean backend-oriented shape), the UI's `queryFn` transforms the response.

## Deferred Features

Three features from the master plan are deferred to Phase 4.5:

1. **CLI entry points** (`eval:scorers`, `eval:agent`, `eval:all`) — same experiment runner infrastructure, just triggered programmatically instead of via admin UI
2. **Golden dataset seeding** (`datasets/golden/*.json`) — requires domain-specific test cases; the infrastructure to import them exists (batch POST)
3. **Feedback-to-training loop** — automatic dataset item creation from human annotations on bad responses

## Key Files

| File | Purpose |
|------|---------|
| `packages/pg/src/storage/datasets.ts` | Dataset CRUD storage (pre-existing, Date fix applied) |
| `packages/pg/src/storage/experiments.ts` | Experiment CRUD storage (pre-existing, Date fix applied) |
| `packages/ingestion/src/jobs/experiment-queue.ts` | BullMQ queue definition (1 attempt, 24h cleanup) |
| `packages/agents/src/experiment-agent.ts` | Supervisor agent without memory for experiments |
| `packages/agents/src/evals/handle-experiment-job.ts` | Core experiment execution: load items, call agent, score, save results |
| `apps/api/src/routes/datasets.ts` | 8 dataset API routes (CRUD + items) |
| `apps/api/src/routes/datasets.test.ts` | 17 dataset route unit tests |
| `apps/api/src/routes/experiments.ts` | 6 experiment API routes (CRUD + compare) |
| `apps/api/src/routes/experiments.test.ts` | 14 experiment route unit tests |
| `apps/worker/src/workers.ts` | Experiment worker section (concurrency: 1, 30min lock) |
| `apps/admin/src/components/pages/datasets.tsx` | Dataset list with create dialog |
| `apps/admin/src/components/pages/dataset-detail.tsx` | Dataset detail with items table, import/export |
| `apps/admin/src/components/pages/experiments.tsx` | Experiment list with run dialog |
| `apps/admin/src/components/pages/experiment-detail.tsx` | Experiment detail with progress, results table |
| `apps/admin/src/components/pages/experiment-compare.tsx` | Side-by-side comparison with deltas |
| `apps/admin/src/layouts/admin-shell.tsx` | Added Datasets + Experiments nav items |
| `apps/admin/src/routes/route-tree.ts` | 5 new routes registered |
| `apps/api/src/mastra/index.ts` | Registered datasetRoutes + experimentRoutes |
| `apps/api/src/index.ts` | Added `initQueue('experiments', redisUrl)` to bootstrap |
