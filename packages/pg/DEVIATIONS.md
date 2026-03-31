# Porting Guide: upstream @mastra/pg → @typhoon/pg

Consult this when merging upstream Mastra changes. Organized by what to
watch for during a port.

---

## Schema Deviations

### Dual-ID on memory tables (threads, messages, resources)

These tables have `id uuid PK` + `external_id text UNIQUE` instead of
upstream's `id text PK`. See README.md for the full pattern.

**When porting:** New `MemoryStorage` methods that query by thread/message/
resource ID must use `external_id` for lookups and `id` for FK operations.
Map `external_id → id` in output.

### UUID PKs on all other tables

Upstream uses `text` PKs. We use `uuid DEFAULT gen_random_uuid()` on:
scores, datasets, dataset_items, dataset_versions, experiments,
experiment_results, ai_spans, workflow_snapshots, and all 14 versioned
entity tables.

**When porting:** If Mastra adds a new table, check whether its IDs come
from `crypto.randomUUID()` (→ safe as uuid) or from Mastra's internal
generators like `generateId()` or compound strings (→ needs text or dual-ID).

### FK constraints

Upstream has zero FKs. We add CASCADE FK constraints between related tables
(see README.md for the full list).

**When porting:** New cross-table references should get FK constraints.
Multi-table deletes must respect FK order or use transactions.

### PostgreSQL enums

We use `pgEnum` for: `document_status`, `sync_job_status`,
`feedback_rating`, `experiment_status`, `entity_status`.

**When porting:** New status values require `ALTER TYPE ... ADD VALUE`
in a migration before code that uses them deploys.

### Timestamps

All tables use `timestamp with timezone`. Upstream auth tables use
`timestamp` without timezone.

### workflow_snapshots PK

Upstream has no PK (only a unique constraint on `(workflow_name, run_id)`).
We add a `uuid` PK.

### apikey.key UNIQUE

Upstream has an index. We add a UNIQUE constraint.

---

## Security Deviations

### Metadata key sanitization

`sanitizeKey()` in `vector/filter.ts` validates JSONB keys against
`^[a-zA-Z_][a-zA-Z0-9_.]*$`. Applied in `buildFilterQuery()` and
memory's `listThreads` metadata filter.

**When porting:** If upstream adds new filter operators that interpolate
keys, apply `sanitizeKey()`.

### Column name validation

`validateColumnName()` in `versioned.ts` and `validateColumn()` in
`validate-columns.ts` use allowlists for dynamic SQL column names.

**When porting:** New columns must be added to the allowlist in the
relevant file:

| File | Tables covered |
|------|---------------|
| `versioned.ts` → `VALID_COLUMNS` | All 14 versioned entity tables |
| `validate-columns.ts` → `SCORE_COLUMNS` | scores |
| `validate-columns.ts` → `EXPERIMENT_COLUMNS` | experiments |
| `validate-columns.ts` → `EXPERIMENT_RESULT_COLUMNS` | experiment_results |
| `validate-columns.ts` → `DATASET_COLUMNS` | datasets |
| `validate-columns.ts` → `AI_SPAN_COLUMNS` | ai_spans |

### Parameterized values

`minScore` in `vector/index.ts` and `LIMIT/OFFSET` in `scores.ts` use
query parameters instead of upstream's string interpolation.

---

## Performance Deviations

### Batch operations

Upstream loops individual INSERTs. We batch:

| Method | File | Strategy |
|--------|------|----------|
| `saveMessages` | memory.ts | Multi-row INSERT |
| `batchCreateSpans` | observability.ts | `sql.begin()` transaction |
| `batchUpdateSpans` | observability.ts | `sql.begin()` transaction |
| `batchDeleteTraces` | observability.ts | `DELETE WHERE IN (...)` |
| `_doBatchInsertItems` | datasets.ts | `sql.begin()` transaction |
| `_doBatchDeleteItems` | datasets.ts | `DELETE WHERE IN (...)` |
| `upsert` | vector/index.ts | Multi-row INSERT ON CONFLICT |

### Server-side pagination

`listThreads` (memory.ts) and `listWorkflowRuns` (workflows.ts) use
SQL `COUNT(*)` + `LIMIT/OFFSET` instead of upstream's fetch-all-and-slice.

### describeIndex metric detection

`vector/index.ts` queries `pg_opclass` to detect the actual HNSW metric
instead of upstream's hardcoded `'cosine'`.

---

## Data Integrity Deviations

### Transactions

Multi-table mutations wrapped in `db.transaction()` or `sql.begin()`:

| Method | File |
|--------|------|
| `deleteThread` | memory.ts |
| `dangerouslyClearAll` | memory.ts, versioned.ts, experiments.ts, datasets.ts |
| `delete` | versioned.ts |
| `deleteExperiment` | experiments.ts |
| `deleteDataset` | datasets.ts |

### $onUpdate on updatedAt

All `updated_at` columns have `$onUpdate(() => new Date())` at the
Drizzle schema level. Upstream only has this on auth tables.

---

## Additional Indexes

| Index | Table | Type |
|-------|-------|------|
| `threads_metadata_gin_idx` | threads | GIN on `metadata` jsonb |
| `feedback_thread_message_idx` | feedback | Composite `(thread_id, message_id)` |
