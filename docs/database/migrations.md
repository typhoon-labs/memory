# Migrations

Typhoon uses [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) to manage PostgreSQL schema migrations. All migration operations are run from the repository root.

## Commands

| Command               | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `bun run db:generate` | Generate a new migration from schema changes                       |
| `bun run db:migrate`  | Apply all pending migrations                                       |
| `bun run db:push`     | Push schema directly to the database (dev only, no migration file) |

These root commands delegate to `drizzle-kit` via Turborepo, scoped to the `@typhoon/db` package. Environment variables (including `DATABASE_URL`) are loaded automatically via `bun dotenv`.

## Configuration

The Drizzle Kit configuration lives at `packages/db/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
```

Key settings:

- **`schema`** -- globs all `.ts` files in `packages/db/src/schema/` (including the `versioned/` subdirectory via the barrel export in `index.ts`)
- **`out`** -- migration SQL files are written to `packages/db/drizzle/`
- **`dialect`** -- PostgreSQL
- **`dbCredentials.url`** -- read from `DATABASE_URL` environment variable

## Migration Files

Generated migrations live in `packages/db/drizzle/` with the naming convention:

```
NNNN_<adjective>_<noun>.sql
```

For example:

```
0000_broken_sumo.sql
0001_right_lionheart.sql
0002_furry_wolfpack.sql
...
0013_curious_wild_child.sql
```

The `packages/db/drizzle/meta/` directory contains Drizzle Kit's internal journal and snapshot files. These track which migrations have been applied and the expected schema state.

## Common Workflows

### Adding a New Table

1. Create a new schema file in `packages/db/src/schema/` (e.g. `my-table.ts`)
2. Define the table using Drizzle's `pgTable()` builder
3. Export the table from `packages/db/src/schema/index.ts`
4. Generate the migration:
   ```bash
   bun run db:generate
   ```
5. Review the generated SQL file in `packages/db/drizzle/`
6. Apply the migration:
   ```bash
   bun run db:migrate
   ```
7. If needed, create or update a repository class in `packages/db/src/repos/`

### Altering an Existing Table

1. Modify the schema definition in the relevant `packages/db/src/schema/*.ts` file
2. Generate the migration:
   ```bash
   bun run db:generate
   ```
3. Review the generated SQL carefully -- Drizzle Kit auto-detects column additions, removals, type changes, index changes, and enum modifications
4. Apply:
   ```bash
   bun run db:migrate
   ```

### Adding an Enum Value

Drizzle Kit handles `pgEnum` changes automatically. Modify the enum definition in the schema file and run `bun run db:generate`. The generated SQL will contain an `ALTER TYPE ... ADD VALUE` statement.

### Development Iteration

During rapid development, use `bun run db:push` to push schema changes directly without creating a migration file. This is useful for prototyping but should not be used for changes that need to be tracked and applied in other environments.

## Integration Tests

Integration tests (`bun run test:integration`) run against a real PostgreSQL instance and expect the schema to be up to date. Always run `bun run db:migrate` before running integration tests after schema changes.

## Troubleshooting

- **"relation does not exist"** -- migrations have not been applied. Run `bun run db:migrate`.
- **Migration conflicts after merging branches** -- if two branches generated migrations with the same sequence number, manually rename one and update the Drizzle journal in `packages/db/drizzle/meta/`.
- **Schema drift** -- if `db:push` was used in dev and the schema is now out of sync with migration files, generate a new migration from the current schema state and apply it to align.
