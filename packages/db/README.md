# @typhoon/db

Database client factory and Drizzle ORM schema definitions. All application tables are defined here and shared across packages.

## Exports

| Export | Description |
|--------|-------------|
| `createDb()` | Factory for a Drizzle ORM client from a `postgres` connection |
| `Db` | Type alias for the Drizzle client instance |
| Schema tables | All Drizzle table definitions (see below) |

## Schema

```
src/schema/
  auth/             — Better Auth tables (user, session, account, apikey)
  versioned/        — Versioned resources (agents, workspaces, skills + version tables)
  documents.ts      — Document metadata and status tracking
  threads.ts        — Chat threads
  messages.ts       — Chat messages within threads
  feedback.ts       — User feedback (ratings, comments)
  sync-jobs.ts      — Background sync job tracking
  sync-targets.ts   — Sync target configuration
  resources.ts      — Generic resource table
  experiments.ts    — Evaluation experiments
  datasets.ts       — Evaluation datasets
  scores.ts         — Evaluation scores
  ai-spans.ts       — Observability spans
```

## Scripts

| Command | Description |
|---------|-------------|
| `db:generate` | Generate Drizzle migration files |
| `db:migrate` | Run pending migrations |
| `db:push` | Push schema changes directly (dev only) |

Requires `DATABASE_URL` environment variable.

## Dependencies

`drizzle-orm`, `postgres`, `@typhoon/config`, `@typhoon/types`
