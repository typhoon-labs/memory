# Phase 6 — Implementation Notes

Notes from Phase 6 (Scorer Management) implementation. Reference for future phases.

## Date Serialization Bug (Fourth Occurrence)

Same bug in `DrizzleScorerDefinitionsStorage` — `new Date()` objects in `create()` and `update()` methods passed to `VersionedStorageHelper` which uses `sql.unsafe()` internally.

- `create()` line 31-32: `created_at: new Date()` and `updated_at: new Date()`
- `update()` line 39: `updated_at: new Date()`

Fixed all three to `.toISOString()`.

**This is the fourth occurrence** (datasets, experiments, observability, scorer-definitions). Every Drizzle storage class in `packages/pg/src/storage/` that extends a Mastra base class and passes `new Date()` to the helper's `create()`/`update()` methods has this bug. The `VersionedStorageHelper` (used by all 7 versioned domains: agents, scorers, prompt blocks, workspaces, skills, MCP servers, MCP clients) funnels through `sql.unsafe()` — any of those storage classes may need the same fix.

## Storage Class Methods vs Raw SQL — Hybrid Approach

Unlike Phase 5 (which used raw SQL exclusively), Phase 6 uses a hybrid approach:

- **Storage class methods** for mutations: `storage.create()`, `storage.update()`, `storage.delete()`, `storage.createVersion()`, `storage.getById()`, `storage.getLatestVersion()`, `storage.listVersions()`, `storage.countVersions()`, `storage.getVersion()`
- **Raw SQL** for the list route only: the storage `list()` method returns raw rows without version info, but the list page needs name/type/status/version from the joined active version

The list route uses a `LEFT JOIN` on `active_version_id` to show version data inline:

```sql
SELECT d.*, v.name, v.description, v.type, v.model, v.instructions,
       v.score_range, v.preset_config, v.default_sampling, v.version_number, v.change_message
FROM scorer_definitions d
LEFT JOIN scorer_definition_versions v ON v.id = d.active_version_id
ORDER BY d.updated_at DESC
```

New (unpublished) scorers have `active_version_id = NULL`, so all version fields come back as NULL in the list. The detail route handles this by falling back to `getLatestVersion()` when no active version is set.

## VersionedStorageHelper — The Versioning Pattern

All 7 versioned domains (agents, scorers, prompt blocks, workspaces, skills, MCP servers, MCP clients) use `VersionedStorageHelper` in `packages/pg/src/storage/versioned.ts`. Key behavior:

- **Two tables**: `{entity}_definitions` (main) + `{entity}_definition_versions` (versions)
- **Status enum**: `draft | active | archived` (shared `entity_status` PostgreSQL enum)
- **Active version pointer**: `active_version_id` UUID on the main table, set during publish
- **Version numbering**: Sequential integers per entity, determined by `countVersions() + 1`
- **Column whitelist**: `validateColumnName()` maintains an allowlist — new columns need to be added there
- **Generic methods**: `list()` supports pagination, ordering, filtering by `authorId` and `metadata`

The storage classes are thin wrappers that map camelCase → snake_case and delegate to the helper.

## Constructor Mock Pattern for Storage Classes

Vitest's `vi.fn().mockImplementation(() => obj)` does not work as a constructor for Mastra storage classes. Use a real `class` in the mock:

```ts
// WRONG — fails with "is not a constructor"
vi.mock('@typhoon/pg', () => ({
  DrizzleScorerDefinitionsStorage: vi.fn().mockImplementation(() => mockStorage),
}));

// CORRECT — use class syntax
vi.mock('@typhoon/pg', () => ({
  DrizzleScorerDefinitionsStorage: class {
    getById = mockStorage.getById;
    create = mockStorage.create;
    // ...
  },
}));
```

This is documented in CLAUDE.md but easy to forget. Applies to any Mastra class that gets `new`'d in the module under test.

## Scorer Construction — Prebuilt vs Custom

The `constructScorer()` utility in `packages/agents/src/evals/scorer-loader.ts` maps database definitions to Mastra scorer instances:

**Prebuilt types** (`faithfulness`, `hallucination`, `answerRelevancy`, `contextRelevance`, `contextPrecision`): Direct mapping to factory functions from `@mastra/evals/scorers/prebuilt`. Context-dependent scorers (all except `answerRelevancy`) return `null` when context is empty — matching the original hardcoded behavior.

**Custom type**: Uses `createScorer()` from `@mastra/core/evals` with the builder pattern:

```ts
createScorer({ id, description, type: 'agent', judge: { model, instructions } })
  .generateScore({ description, createPrompt: ({ run }) => ... })
  .generateReason({ description, createPrompt: ({ run, score }) => ... })
```

The `type: 'agent'` shortcut sets the input/output schemas to Mastra's `ScorerRunInputForAgent` / `ScorerRunOutputForAgent`, which matches how `scoreMessage()` passes data to scorers.

**Context is per-message, not per-definition.** Prebuilt scorers like `faithfulness` need `context` baked in at construction time (it's an option passed to the factory). Since different messages have different retrieved chunks, scorers must be constructed per-message after context extraction. The worker caches **definitions** (metadata from DB), not **scorer instances**.

## scoreMessage() Extension — Backward Compatible

Added optional 4th parameter `scorerDefinitions?: ScorerDefinitionVersion[]`:

```ts
const scorerEntries = scorerDefinitions
  ? scorerDefinitions
      .map((def) => constructScorer(def, model, context))
      .filter((e): e is NonNullable<typeof e> => e !== null)
  : createScorerEntries(model, context);
```

When `undefined`, falls back to the hardcoded 5 RAG scorers. This preserves backward compatibility for existing tests and any direct callers.

## Worker Scorer Cache — Lazy Refresh

The worker doesn't load scorers on startup — it refreshes lazily before the first scoring job:

```ts
let _cachedScorerDefs: ScorerDefinitionVersion[] = [];
let _lastScorerLoad = 0;
const SCORER_REFRESH_MS = 5 * 60 * 1000;

async function refreshScorerDefinitions() {
  if (Date.now() - _lastScorerLoad < SCORER_REFRESH_MS && _cachedScorerDefs.length > 0) return;
  // ... fetch from DB
}
```

This means "Refreshed scorer definitions" only appears in logs when a `score-message` job actually runs. On error, the cache keeps its previous values — a DB blip doesn't wipe out working scorer config.

The `PUBLISHED_SCORERS_QUERY` and `mapScorerRows()` are exported from `@typhoon/agents` so both the worker and API preview route can reuse them without duplicating the SQL/mapping logic.

## Preview Route — Synchronous LLM Call

The `POST /v1/admin/scorers/:id/preview` route runs a scorer synchronously in the API process:

1. Loads the version data from DB
2. Constructs a scorer via `constructScorer()`
3. Runs it with the same input format as `scoreMessage()` uses
4. Returns `{ score, reason, durationMs }`

This is a 5-30 second blocking call. Acceptable for a test/preview feature used by admins. The scoring model is lazily imported (`await import('@typhoon/ai')`) to avoid loading it for non-preview requests.

## Seed Script — UUID Format

PostgreSQL UUID columns reject non-hex characters. The initial seed UUIDs used `00000000-seed-1000-...` which failed with `invalid input syntax for type uuid`. Fixed to valid v4-format UUIDs: `00000000-0000-4000-a000-000000010001`.

The seed script also can't resolve workspace packages (`@typhoon/db`, `postgres`) when run from the `scripts/` directory. It uses `import('postgres')` dynamically and must be run from a directory where `postgres` is resolvable (e.g. `packages/pg`), or via the `bun -e` inline approach.

## Key Files

| File | Purpose |
|------|---------|
| `packages/pg/src/storage/scorer-definitions.ts` | Storage class (Date bug fixed) |
| `packages/pg/src/index.ts` | Added `DrizzleScorerDefinitionsStorage` export |
| `packages/agents/src/evals/scorer-loader.ts` | `constructScorer()`, `PUBLISHED_SCORERS_QUERY`, `mapScorerRows()` |
| `packages/agents/src/evals/handle-scoring-job.ts` | `scoreMessage()` extended with optional `scorerDefinitions` param |
| `apps/api/src/routes/scorers.ts` | 9 scorer API routes (CRUD + versions + publish + preview) |
| `apps/api/src/routes/scorers.test.ts` | 23 scorer route unit tests |
| `apps/api/src/mastra/index.ts` | Registered `scorerRoutes` |
| `apps/admin/src/components/pages/scorers.tsx` | Scorer list page with create dialog |
| `apps/admin/src/components/pages/scorer-detail.tsx` | Scorer detail: config form, preview, version history |
| `apps/admin/src/layouts/admin-shell.tsx` | Added Scorers nav item |
| `apps/admin/src/routes/route-tree.ts` | Registered 2 new routes |
| `apps/worker/src/workers.ts` | Scorer definition cache + lazy refresh |
| `scripts/seed-scorers.ts` | Seed initial 5 RAG scorer definitions |
