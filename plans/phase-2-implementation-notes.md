# Phase 2 — Implementation Notes

Notes from Phase 2 (Conversation Reviewer) implementation. Reference for future phases.

## Admin User Role

The `admin@typhoon.local` Dex user is created with role `rep` by default via the OIDC flow. The `requireAdmin` middleware checks `user.role === 'admin'`. Must manually promote in the DB:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'admin@typhoon.local';
```

After changing the role, the user must re-authenticate — Better Auth caches the role in the session.

## Score Storage — Raw SQL, Not Drizzle

`DrizzleScoresStorage` uses raw `postgres` (`this.sql.unsafe()`) for all queries, not the Drizzle ORM. This is because it extends Mastra's `ScoresStorage` base class which predates Drizzle adoption. New methods (`listScoresByThreadId`, `getThreadScoreAggregates`, `deleteScore`) follow the same pattern.

The private `listScores()` helper accepts a raw WHERE clause string + params array and handles pagination. New public methods delegate to it:

```ts
async listScoresByThreadId(args) {
  return this.listScores(`"thread_id" = $1`, [args.threadId], args.pagination);
}
```

## Reviews List — Two-Step Aggregation

The `GET /v1/admin/reviews` endpoint uses a two-step approach instead of a single JOIN:

1. Fetch all threads with message counts via raw SQL (`GROUP BY t."id"`)
2. Batch-fetch score aggregates via `= ANY($1)` on the `scores_thread_id_idx` index
3. Merge, filter, sort, paginate in-memory

This avoids complex `LATERAL` joins and is acceptable at hundreds/low-thousands of threads. Phase 3 should add `thread_score_summary` materialized view for larger scale.

The `worstScore` sort uses `null` comparison to push unscored threads to the bottom:
```ts
if (a.minScore === null) return 1;  // unscored → last
if (b.minScore === null) return -1;
return a.minScore - b.minScore;     // lowest first
```

## Human Annotation → Score Mapping

Annotations are stored in the `scores` table with this convention:

| Column | Value |
|--------|-------|
| `scorer_id` | `'human-review'` |
| `entity_type` | `'message'` |
| `entity_id` | `messages.externalId` |
| `thread_id` | Thread external ID |
| `score` | `1.0` if tags include `'correct'`, else `0.0` |
| `reason` | Free-text comment from annotator |
| `metadata` | `{ source: 'human', tags: [...], severity: 'minor'|'major'|'critical', annotatorId: userId }` |
| `resource_id` | Annotator's user ID |

Lookup for existing annotations uses `metadata->>'annotatorId'`:
```sql
SELECT id FROM "scores"
WHERE "entity_id" = $1 AND "entity_type" = 'message'
  AND "scorer_id" = 'human-review'
  AND "metadata"->>'annotatorId' = $2
```

One annotation per message per annotator. Multiple annotators can annotate the same message.

## Score Card States

The `ScoreCards` component uses a time-based heuristic for the "Scoring..." state instead of checking BullMQ queue status:

- Message < 60s old with no scores → show spinner "Scoring..."
- Message ≥ 60s old with no scores → show "Not scored"
- Some scores present → show what exists

This avoids coupling the admin UI to the queue implementation. Phase 3 could add a `/v1/admin/reviews/:threadId/scoring-status` endpoint that checks `queue.getJob()` for precise state.

## Scoring Without Context

When the knowledge search returns no relevant chunks (as happened with "vacation policy"), only `answerRelevancy` runs. The context-dependent scorers (faithfulness, hallucination, contextRelevance, contextPrecision) are skipped because Mastra's prebuilt scorers reject empty context arrays. This is correct Phase 1 behavior — the review detail page shows just one score card in this case.

## Navigation Restructure

`AppShell` already supported the `label` property on `NavGroup` for section headings — it renders a `<p>` with `uppercase tracking-widest` styling. The restructure from flat to sectioned was a data-only change in `admin-shell.tsx`:

| Section | Pages |
|---------|-------|
| Overview | Dashboard |
| Content | Sync Sources, Documents |
| Quality | Reviews |
| Operations | Queues |

The Feedback page component (`feedback.tsx`) is preserved but removed from nav. The desk app's `useFeedback()` hook still calls `POST /v1/feedback`. Phase 3 dashboard will read from both `feedback` and `scores` tables.

## Route Helpers Exported from threads.ts

`toUIMessage()`, `toThreadResponse()`, and `normalizeToolPart()` were made `export` so the reviews route can reuse them. The reviews detail endpoint follows the same pattern as `GET /v1/threads/:threadId` but without the `resourceId` filter (admin view sees all threads).

## Frontend Error Handling

The reviews list page must use `data?.threads` (optional chaining) when checking the query response. When the API returns an error (e.g., 403 Forbidden), React Query sets `data` to the error JSON `{error: "Forbidden"}` which is truthy but lacks `.threads`. Without optional chaining, `data.threads.length` throws and crashes the page.

## Key Files

| File | Purpose |
|------|---------|
| `packages/pg/src/storage/scores.ts` | Added `listScoresByThreadId()`, `getThreadScoreAggregates()`, `deleteScore()` |
| `apps/api/src/routes/reviews.ts` | 5 admin review API routes (list, detail, annotate CRUD) |
| `apps/api/src/routes/reviews.test.ts` | 20 unit tests for review routes |
| `apps/admin/src/components/pages/reviews.tsx` | Reviews list page with DataTable |
| `apps/admin/src/components/pages/review-detail.tsx` | Thread detail page |
| `apps/admin/src/components/pages/review-detail/message-timeline.tsx` | Message timeline with user/assistant bubbles |
| `apps/admin/src/components/pages/review-detail/score-cards.tsx` | Score display cards with pass/fail badges |
| `apps/admin/src/components/pages/review-detail/annotation-panel.tsx` | Human annotation form with tag checkboxes |
| `apps/admin/src/components/pages/review-detail/shared.ts` | Types, constants, score thresholds |
| `apps/admin/src/layouts/admin-shell.tsx` | Restructured nav into labeled sections |
| `apps/admin/src/routes/route-tree.ts` | Replaced feedback route with reviews routes |
| `apps/api/src/routes/threads.ts` | Exported `toUIMessage`, `toThreadResponse`, `normalizeToolPart` |
| `apps/api/src/mastra/index.ts` | Wired `reviewRoutes` into API |
