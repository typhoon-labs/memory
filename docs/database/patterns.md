# Database Patterns

Common Drizzle ORM patterns and conventions used throughout the Typhoon codebase.

## Repository Pattern

All database queries go through repository classes in `packages/db/src/repos/`. Each repo receives a Drizzle `db` instance via constructor injection and encapsulates all queries for a specific domain.

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { documents } from '../schema/document';

export class DocumentRepo {
  constructor(private db: Db) {}

  async findById(id: string) {
    const [doc] = await this.db.select().from(documents).where(eq(documents.id, id));
    return doc ?? null;
  }
}
```

Repos are wired together in composition roots (`apps/*/src/services.ts`) and injected into services:

```
Composition Root -> Repo(db) -> Service(repo)
```

### Available Repos

| Repo             | Table(s)                                           |
| ---------------- | -------------------------------------------------- |
| `DocumentRepo`   | `documents`                                        |
| `SyncTargetRepo` | `sync_targets`                                     |
| `SyncJobRepo`    | `sync_jobs`                                        |
| `ThreadRepo`     | `threads`                                          |
| `MessageRepo`    | `messages`                                         |
| `FeedbackRepo`   | `feedback`                                         |
| `MetadataRepo`   | `metadata_field_groups`, `metadata_templates`      |
| `ScoreRepo`      | `scores`                                           |
| `ScorerRepo`     | `scorer_definitions`, `scorer_definition_versions` |
| `ExperimentRepo` | `experiments`, `experiment_results`                |
| `FailedJobRepo`  | `failed_jobs`                                      |
| `DashboardRepo`  | Aggregation queries across multiple tables         |
| `ReviewRepo`     | Cross-table review queries                         |
| `TraceRepo`      | `ai_spans`                                         |
| `PartitionRepo`  | Table partitioning utilities                       |

## Query Builder vs Raw SQL

### Query Builder (Preferred for CRUD)

Use the Drizzle query builder for standard CRUD operations:

```typescript
// Select with conditions
await this.db
  .select()
  .from(documents)
  .where(and(eq(documents.syncTargetId, targetId), ne(documents.status, 'deleted')));

// Insert with returning
const [row] = await this.db.insert(documents).values(data).returning();

// Update with returning
const [updated] = await this.db
  .update(documents)
  .set({ status: 'ready', updatedAt: new Date() })
  .where(eq(documents.id, id))
  .returning();

// Delete
await this.db.delete(threads).where(eq(threads.id, id));
```

### Raw SQL Template (for Complex Queries)

Use `sql` template literals for queries that exceed the builder's expressiveness:

```typescript
import { sql } from 'drizzle-orm';

// JSONB introspection with lateral join
const rows = await this.db.execute(sql`
  SELECT kv.key,
         jsonb_agg(DISTINCT kv.value) FILTER (WHERE jsonb_typeof(kv.value) != 'null') AS values,
         COUNT(DISTINCT d.id)::int AS count
  FROM documents d,
       jsonb_each(d.custom_metadata) AS kv(key, value)
  WHERE d.status != 'deleted'
  GROUP BY kv.key
  ORDER BY count DESC
`);

// Atomic counter increment
await this.db
  .update(syncJobs)
  .set({
    childJobsCompleted: sql`${syncJobs.childJobsCompleted} + 1`,
  })
  .where(eq(syncJobs.id, id));
```

## Common Query Patterns

### Find by ID

```typescript
async findById(id: string) {
  const [row] = await this.db.select().from(table).where(eq(table.id, id));
  return row ?? null;
}
```

### List with Pagination

```typescript
async list(opts: { limit: number; offset: number }) {
  const [rows, [{ total }]] = await Promise.all([
    this.db.select().from(table)
      .orderBy(desc(table.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    this.db.select({ total: count() }).from(table),
  ]);
  return { rows, total };
}
```

### Upsert (Insert or Update on Conflict)

```typescript
async upsertBySourceKey(data: typeof documents.$inferInsert) {
  const [row] = await this.db.insert(documents)
    .values(data)
    .onConflictDoUpdate({
      target: [documents.syncTargetId, documents.sourceKey],
      set: {
        status: 'processing',
        errorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
```

### Bulk Operations with `inArray`

```typescript
import { inArray } from 'drizzle-orm';

async bulkMarkDeleted(ids: string[]) {
  if (ids.length === 0) return;
  await this.db.update(documents)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(inArray(documents.id, ids));
}

async findByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return this.db.select().from(documents).where(inArray(documents.id, ids));
}
```

### Count

```typescript
import { count } from 'drizzle-orm';

const [{ total }] = await this.db.select({ total: count() }).from(table).where(eq(table.resourceId, resourceId));
```

## JSONB Columns

### Type-Safe JSONB with `$type<>()`

All JSONB columns use `$type<>()` to declare their TypeScript shape:

```typescript
customMetadata: jsonb('custom_metadata').$type<Record<string, unknown>>().notNull().default({}),
fields: jsonb('fields').$type<Record<string, { type: 'string' | 'number'; required?: boolean }>>().notNull().default({}),
fieldGroupIds: jsonb('field_group_ids').$type<string[]>().notNull().default([]),
```

### GIN Indexes for JSONB

JSONB columns that are queried with containment operators get GIN indexes:

```typescript
// Schema definition
(index('documents_custom_metadata_idx').using('gin', table.customMetadata),
  index('threads_metadata_gin_idx').using('gin', table.metadata),
  // Query using JSONB containment
  await this.db.execute(
    sql`UPDATE metadata_templates
      SET field_group_ids = field_group_ids - ${id}
      WHERE field_group_ids::jsonb @> ${JSON.stringify([id])}::jsonb`,
  ));
```

## Enum Columns

Define enums with `pgEnum` and reference them in table columns:

```typescript
export const documentStatusEnum = pgEnum('document_status', ['pending', 'processing', 'ready', 'error', 'deleted']);

export const documents = pgTable('documents', {
  status: documentStatusEnum('status').notNull().default('pending'),
});
```

## Timestamp Patterns

### Auto-Updating `updated_at`

Use `$onUpdate()` to set `updated_at` automatically on every update:

```typescript
updatedAt: timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date()),
```

Note: `$onUpdate` runs in the application layer (Drizzle), not as a database trigger. Direct SQL updates bypass it.

### Explicit `updatedAt` in Repos

Because some update paths use raw SQL or partial sets, repos often set `updatedAt` explicitly:

```typescript
await this.db
  .update(documents)
  .set({ ...data, updatedAt: new Date() })
  .where(eq(documents.id, id));
```

## Cascading Deletes

Foreign keys with `onDelete: 'cascade'` are used extensively so that deleting a parent row automatically cleans up children:

```typescript
syncTargetId: uuid('sync_target_id').notNull()
  .references(() => syncTargets.id, { onDelete: 'cascade' }),
```

The pattern is consistent:

- `documents` cascade from `sync_targets`
- `sync_jobs` cascade from `sync_targets`
- `messages` cascade from `threads`
- `feedback` cascades from `threads`, `messages`, and `user`
- `experiment_results` cascade from `experiments`
- `dataset_items` and `dataset_versions` cascade from `datasets`
- All version tables cascade from their parent entity table

The exception is `metadata_templates` referenced by `sync_targets`, which uses `onDelete: 'set null'` to avoid cascading a template deletion to all its sync targets.

## Composite and Unique Indexes

```typescript
// Composite unique index
uniqueIndex('documents_sync_target_key_unique_idx').on(table.syncTargetId, table.sourceKey),

// Unique index with COALESCE expression
uniqueIndex('sync_targets_name_managed_by_idx').on(
  table.name,
  sql`COALESCE(${table.managedBy}, 'manual')`
),

// Composite primary key
primaryKey({ columns: [table.id, table.datasetVersion] }),
```

## Drizzle Relations (for Query API)

Relations are defined separately from the table schema and are used by Drizzle's relational query API:

```typescript
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));
```

Currently only auth tables use Drizzle relations; other tables rely on explicit joins in repo methods.
