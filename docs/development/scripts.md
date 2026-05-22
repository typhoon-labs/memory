# Scripts Reference

All scripts available in the root `package.json`. Run any script with `bun run <name>`.

## Setup and Reset

| Script          | Command                  | Description                                                                                                     |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `bun run setup` | `./scripts/dev-setup.sh` | First-time dev setup: check prerequisites, install deps, create `.env`, start Docker, run migrations, seed data |
| `bun run reset` | `./scripts/reset-dev.sh` | Tear down Docker (with volumes), remove `node_modules` and caches, re-run full setup from scratch               |
| `bun run clean` | `./scripts/clean.sh`     | Remove `node_modules`, `.turbo`, `coverage`, `dist` directories -- no Docker teardown                           |

### What `setup` does step-by-step

1. Checks that Bun, Docker, and Docker Compose are installed
2. Runs `bun install` (installs Lefthook git hooks via `postinstall`)
3. Copies `.env.example` to `.env` (if `.env` does not exist)
4. Starts all Docker services via `./scripts/docker.sh up -d`
5. Waits for the `typhoon-migrate` container to finish running database migrations
6. Runs `./scripts/seed-data.sh` to populate sample data

### What `reset` does step-by-step

1. Stops all Docker containers and **removes volumes** (all data is lost)
2. Removes `node_modules`, `.turbo`, `dist`, and other build artifacts
3. Re-runs `./scripts/dev-setup.sh` (the full setup)

### What `clean` removes

```
node_modules/
.turbo/
coverage/
packages/*/dist/
packages/*/.turbo/
apps/*/dist/
apps/*/.turbo/
```

## Development Servers

| Script                | Command                                                                           | Description                             |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| `bun run dev`         | `turbo run dev`                                                                   | Start all services via Turborepo        |
| `bun run dev:api`     | `turbo run dev --filter=@typhoon/api`                                                | API server + package dependencies       |
| `bun run dev:desk`    | `turbo run dev --filter=@typhoon/desk`                                               | Rep desk + package dependencies         |
| `bun run dev:admin`   | `turbo run dev --filter=@typhoon/admin`                                              | Admin dashboard + package dependencies  |
| `bun run dev:widget`  | `turbo run dev --filter=@typhoon/widget`                                             | Customer widget + package dependencies  |
| `bun run dev:worker`  | `turbo run dev --filter=@typhoon/worker`                                             | BullMQ worker + package dependencies    |
| `bun run dev:backend` | `turbo run dev --filter=@typhoon/api --filter=@typhoon/worker --filter=@typhoon/scheduler` | API + worker + scheduler (no frontends) |

All `dev:*` commands use Turborepo's `--filter` flag, which automatically starts the target package and any workspace packages it depends on.

### Service URLs

| Service         | URL                   |
| --------------- | --------------------- |
| API server      | http://localhost:5172 |
| Rep desk        | http://localhost:5173 |
| Admin dashboard | http://localhost:5174 |
| Customer widget | http://localhost:5175 |

## Docker

| Script                   | Command                                                         | Description                                |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------ |
| `bun run docker:up`      | `./scripts/docker.sh up -d --build`                             | Start all services (build images + detach) |
| `bun run docker:down`    | `./scripts/docker.sh down`                                      | Stop all services                          |
| `bun run docker:restart` | `./scripts/docker.sh down && ./scripts/docker.sh up -d --build` | Stop, rebuild, and start all services      |
| `bun run docker:status`  | `./scripts/docker.sh ps`                                        | Show running containers and health status  |
| `bun run docker:build`   | `./scripts/docker.sh build --no-cache`                          | Rebuild all images from scratch (no cache) |
| `bun run docker:logs`    | `./scripts/docker.sh logs -f`                                   | Tail logs from all services (follow mode)  |

### The `docker.sh` Wrapper

All Docker commands go through `./scripts/docker.sh`. **Never use raw `docker compose` directly** -- the wrapper handles critical configuration that raw `docker compose` would miss:

```bash
#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROJECT_NAME=typhoon

COMPOSE="-f infra/docker/docker-compose.yml"
[ "${PROD:-}" != "1" ] && COMPOSE="$COMPOSE -f infra/docker/docker-compose.dev.yml"

exec docker compose $COMPOSE \
  --env-file .env \
  --profile all "$@"
```

What the wrapper provides:

| Feature            | Detail                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| Project name       | Sets `COMPOSE_PROJECT_NAME=typhoon` so containers are prefixed `typhoon-`                 |
| Multi-file compose | Merges `docker-compose.yml` + `docker-compose.dev.yml`                              |
| Environment file   | Loads `.env` automatically                                                          |
| Profile            | Activates the `all` profile (includes optional services like Dex, Bifrost, Grafana) |
| Production mode    | When `PROD=1`, skips the dev overlay                                                |

**Production mode:**

```bash
PROD=1 ./scripts/docker.sh up -d
```

## Database

| Script                | Command                                                                  | Description                                        |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `bun run db:generate` | `bun dotenv -- turbo run db:generate --env-mode=loose --filter=@typhoon/db` | Generate Drizzle migration from schema diff        |
| `bun run db:migrate`  | `bun dotenv -- turbo run db:migrate --env-mode=loose --filter=@typhoon/db`  | Apply pending migrations to the database           |
| `bun run db:push`     | `bun dotenv -- turbo run db:push --env-mode=loose --filter=@typhoon/db`     | Push schema directly (no migration file, dev only) |

These commands use `bun dotenv` to load `.env` before running Turborepo, and `--env-mode=loose` to pass environment variables through to the Drizzle commands.

### Workflow for Schema Changes

```bash
# 1. Edit schema files in packages/db/src/schema/
# 2. Generate migration
bun run db:generate

# 3. Apply migration
bun run db:migrate

# 4. Commit the migration file with your changes
git add packages/db/drizzle/
```

## Testing

| Script                     | Command                                            | Description                         |
| -------------------------- | -------------------------------------------------- | ----------------------------------- |
| `bun run test`             | `vitest run`                                       | Run all unit tests once             |
| `bun run test:watch`       | `vitest`                                           | Run unit tests in watch mode        |
| `bun run test:coverage`    | `vitest run --coverage`                            | Run unit tests with coverage report |
| `bun run test:integration` | `vitest run --config vitest.integration.config.ts` | Run PostgreSQL integration tests    |
| `bun run test:e2e`         | `vitest run --config vitest.e2e.config.ts`         | Run E2E tests via Playwright        |

See [Testing](testing.md) for details on test types, coverage thresholds, and mocking patterns.

## Quality and Checks

| Script                 | Command                                                        | Description                                    |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `bun run lint`         | `bunx oxlint .`                                                | Run oxlint on all source files                 |
| `bun run format`       | `bunx oxfmt .`                                                 | Auto-fix formatting with oxfmt                 |
| `bun run format:check` | `bunx oxfmt --check .`                                         | Check formatting without modifying files       |
| `bun run check`        | `bunx oxfmt --check . && bunx oxlint . && turbo run typecheck` | Format check + lint + typecheck in one command |
| `bun run typecheck`    | `turbo run typecheck`                                          | TypeScript type check across all packages      |

### Full Quality Gate Check

```bash
bun run check && bun run test
```

See [Quality Gates](quality-gates.md) for the complete 7-step checklist.

## Build

| Script          | Command           | Description                 |
| --------------- | ----------------- | --------------------------- |
| `bun run build` | `turbo run build` | Build all packages and apps |

## Other

| Script           | Command                  | Description                                                                   |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `bun run seed`   | `./scripts/seed-data.sh` | Seed DB (sync targets, scorers, datasets) + upload sample docs to MinIO       |
| `bun run doctor` | `./scripts/doctor.sh`    | Health check all services (Docker, DB, Redis, MinIO, HTTP endpoints, Grafana) |

### What `seed` does

1. Checks that `typhoon-api`, `typhoon-postgres`, and `typhoon-minio` containers are running
2. Seeds the database:
   - Sync targets and documents
   - Metadata field groups and templates
   - Scorer definitions
   - Datasets, experiments, and scores
3. Generates binary fixtures (PDF, DOCX, XLSX) from TypeScript generators
4. Uploads sample documents to the MinIO `typhoon-documents` bucket

### What `doctor` checks

| Category       | Checks                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Docker         | Docker daemon is running                                                                                        |
| Containers     | All 12 containers running (postgres, redis, minio, dex, api, worker, scheduler, desk, admin, widget, otel-lgtm) |
| PostgreSQL     | Accepting connections, pgvector extension installed                                                             |
| Redis          | PING returns PONG                                                                                               |
| MinIO          | `typhoon-documents` bucket exists                                                                                  |
| HTTP endpoints | API health, Desk, Admin, Widget respond                                                                         |
| Observability  | Grafana health endpoint responds                                                                                |

## Internal Scripts

These are invoked automatically and not typically run directly:

| Script        | Command                    | Description                                                   |
| ------------- | -------------------------- | ------------------------------------------------------------- |
| `postinstall` | `./scripts/postinstall.sh` | Installs Lefthook git hooks (skipped in Docker builds and CI) |
