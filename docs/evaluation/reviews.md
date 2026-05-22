# Review Pipeline

## Overview

The review pipeline automatically scores agent responses after each chat message. It uses a BullMQ Flow to fan out scoring across multiple scorers in parallel, then aggregates results.

## Trigger

Reviews are triggered from the chat handler in the API server after each assistant message is generated. The trigger respects two controls:

| Control     | Environment Variable  | Default | Description                                                                    |
| ----------- | --------------------- | ------- | ------------------------------------------------------------------------------ |
| Enabled     | `SCORING_ENABLED`     | `true`  | Master toggle. Set to `false` or `0` to disable all scoring workers.           |
| Sample rate | `SCORING_SAMPLE_RATE` | `1.0`   | Fraction of messages to score (0.0-1.0). Set to 0.5 to score half of messages. |

## Pipeline Flow

```
score-message (reviews queue)
    |
    +-- Fetch messages, extract content
    +-- Hydrate chunk text from vector store
    +-- Determine applicable scorers
    +-- Check idempotency (skip already-scored)
    |
    +-- Create BullMQ Flow:
        |
        +-- score-run (scoring queue, scorer 1)  -- priority: 1
        +-- score-run (scoring queue, scorer 2)  -- priority: 1
        +-- score-run (scoring queue, scorer N)  -- priority: 1
        |
        +-- score-aggregate (reviews queue)  -- waits for all children
```

### Step 1: score-message

The `score-message` job runs on the **reviews** queue:

1. Resolves the latest assistant message in the thread (if not provided).
2. Fetches the assistant and preceding user message content.
3. Extracts scoring data from the message JSONB (response text, chunk sources).
4. Hydrates chunk text from the vector store for context-dependent scorers.
5. Determines applicable scorers: loads active scorer definitions, filters by context availability, checks idempotency.
6. Creates a BullMQ Flow with `score-run` children on the scoring queue and a `score-aggregate` parent on the reviews queue.

### Step 2: score-run

Each `score-run` job runs on the **scoring** queue (shared with experiments):

1. Constructs the scorer from its definition.
2. Runs the scorer against the extracted user question, response text, and context.
3. Persists the score to the `scores` table (with idempotency check).
4. Returns the scorer ID, score, and reason.

Score-run jobs have `ignoreDependencyOnFailure: true`, so a single scorer failure does not block the aggregate.

### Step 3: score-aggregate

The `score-aggregate` job collects results from all completed score-run children:

1. Calls `job.getChildrenValues()` to get successful scores.
2. Calls `job.getFailedChildrenValues()` to count failed scorers.
3. Logs the aggregate result (scored, skipped, failed).

## Priority Scheduling

Reviews and experiments share the scoring queue. Review score-run jobs use priority 1 (higher priority), while experiment score-run jobs use priority 5 (lower priority). This ensures live chat scoring is not blocked by batch experiment runs.

## Worker Configuration

| Variable                  | Default | Queue   | Description                                  |
| ------------------------- | ------- | ------- | -------------------------------------------- |
| `SCORING_CONCURRENCY`     | `5`     | reviews | Concurrent review jobs per worker replica    |
| `SCORING_RUN_CONCURRENCY` | `10`    | scoring | Concurrent score-run jobs per worker replica |
| `SCORING_RUN_RATE_MAX`    | `15`    | scoring | Max scoring jobs per second (rate limiter)   |

The scoring worker also includes a rate limiter (`limiter.max` / `limiter.duration`) to protect the LLM API from burst traffic.

## Scorer Definition Caching

The reviews worker caches active scorer definitions and refreshes them before each `score-message` job via `refreshScorerDefinitions()`. This avoids hitting the database for every message while ensuring new scorers are picked up promptly.

## Key Files

- `apps/worker/src/workers/reviews.worker.ts` -- reviews queue worker (score-message, score-aggregate)
- `apps/worker/src/workers/scoring.worker.ts` -- scoring queue worker (score-run)
- `packages/evals/src/handle-scoring-job.ts` -- `prepareScoring()`, `runSingleScorer()`
- `packages/evals/src/extract-scoring-data.ts` -- message content extraction
