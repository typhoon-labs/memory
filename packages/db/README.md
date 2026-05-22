# @typhoon/db

Database client factory, Drizzle ORM schema definitions, repository layer, and Mastra storage drivers. All application tables are defined here and shared across the entire monorepo.

## Architecture Context

`@typhoon/db` is the foundational data layer of the Typhoon platform. Every package and app that touches PostgreSQL depends on it, either directly or transitively.

```mermaid
%%{init: {'theme': 'neutral'}}%%
graph TD
    DB["@typhoon/db"]
    SVC["@typhoon/services"]
    ING["@typhoon/ingestion"]
    AGT["@typhoon/agents"]
    API["apps/api"]
    WRK["apps/worker"]
    SCH["apps/scheduler"]

    SVC --> DB
    ING --> DB
    AGT --> DB
    API --> DB
    WRK --> DB
    SCH --> DB
```

The package exposes four entry points:

| Entry Point     | Import Path           | Purpose                                                |
| --------------- | --------------------- | ------------------------------------------------------ |
| Schema + client | `@typhoon/db`            | Table definitions, `createDb()`, `createConnection()`  |
| Repositories    | `@typhoon/db/repos`      | Data access classes (one per domain)                   |
| Mastra drivers  | `@typhoon/db/drivers/pg` | `PgStore`, `PgVector` for Mastra framework integration |
| Connection      | `@typhoon/db/connection` | `createConnection()` for app-level connection pools    |

## Internal Structure

```
src/
  index.ts                  -- Package entry: re-exports schema tables + client factory
  client.ts                 -- createDb() factory, Db type alias
  connection.ts             -- createConnection() for app-owned connection pools
  schema/                   -- All Drizzle table definitions
    auth.ts                 -- Better Auth tables (user, session, account, apikey)
    document.ts             -- Document metadata and status tracking
    sync-target.ts          -- Sync target configuration
    sync-job.ts             -- Background sync job tracking
    threads.ts              -- Chat threads
    messages.ts             -- Chat messages within threads
    feedback.ts             -- User feedback (ratings, comments)
    scores.ts               -- Evaluation scores
    experiments.ts          -- Evaluation experiments + results
    datasets.ts             -- Evaluation datasets + items + versions
    observability.ts        -- AI spans (Mastra OTel bridge)
    metadata-field-group.ts -- Reusable metadata field group definitions
    metadata-template.ts    -- Composable metadata templates
    resources.ts            -- Generic resource table (user profiles)
    blobs.ts                -- Skill blob content-addressable store
    failed-job.ts           -- Archived failed BullMQ jobs
    workflows.ts            -- Workflow snapshots
    versioned/              -- Versioned entity tables (agent, workspace, skill, etc.)
      agents.ts             -- agents + agent_versions
      workspaces.ts         -- workspaces + workspace_versions
      skills.ts             -- skills + skill_versions
      scorer-definitions.ts -- scorer_definitions + scorer_definition_versions
      prompt-blocks.ts      -- prompt_blocks + prompt_block_versions
      mcp-clients.ts        -- mcp_clients + mcp_client_versions
      mcp-servers.ts        -- mcp_servers + mcp_server_versions
  repos/                    -- Repository classes (data access only)
  drivers/pg/               -- Mastra-compatible PgStore + PgVector drivers
```

## Schema Overview

All tables with their key columns and relationships:

### Authentication (Better Auth)

| Table     | Key Columns                        | Notes                           |
| --------- | ---------------------------------- | ------------------------------- |
| `user`    | id, name, email, role, banned      | Primary user identity           |
| `session` | id, token, userId, expiresAt       | Session management, FK to user  |
| `account` | id, accountId, providerId, userId  | OIDC provider links, FK to user |
| `apikey`  | id, key, referenceId, rateLimitMax | API key auth with rate limiting |

### Documents and Ingestion

| Table          | Key Columns                                                        | Notes                                                            |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `sync_targets` | id, name, sourceType, config, cronSchedule, metadataTemplateId     | S3/MinIO source config, FK to metadata_templates                 |
| `sync_jobs`    | id, syncTargetId, status, filesScanned/New/Updated/Deleted/Errored | Job tracking per sync run                                        |
| `documents`    | id, syncTargetId, sourceKey, status, title, customMetadata (JSONB) | Unique on (syncTargetId, sourceKey), GIN index on customMetadata |
| `failed_jobs`  | id, queue, jobName, jobId, data, failedReason                      | Persistent archive of failed BullMQ jobs                         |

### Chat

| Table      | Key Columns                                           | Notes                          |
| ---------- | ----------------------------------------------------- | ------------------------------ |
| `threads`  | id, externalId, resourceId, title, metadata (JSONB)   | GIN index on metadata          |
| `messages` | id, externalId, threadId, role, type, content (JSONB) | FK to threads (cascade delete) |
| `feedback` | id, threadId, messageId, userId, rating, comment      | FK to threads, messages, user  |

### Metadata

| Table                   | Key Columns                                           | Notes                            |
| ----------------------- | ----------------------------------------------------- | -------------------------------- |
| `metadata_field_groups` | id, name, fields (JSONB)                              | Reusable field sets, unique name |
| `metadata_templates`    | id, name, fieldGroupIds (JSONB), customFields (JSONB) | Compose groups + custom fields   |

### Evaluation

| Table                | Key Columns                                          | Notes                                         |
| -------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `scores`             | id, scorerId, traceId, score, reason, threadId       | Indexed on scorer, run, trace, entity, thread |
| `experiments`        | id, name, datasetId, targetType, targetId, status    | Evaluation runs                               |
| `experiment_results` | id, experimentId, itemId, input, output, groundTruth | Per-item results                              |
| `datasets`           | id, name, version, inputSchema                       | Evaluation datasets                           |
| `dataset_items`      | id, datasetId, datasetVersion, input, groundTruth    | Composite PK (id, datasetVersion)             |
| `dataset_versions`   | id, datasetId, version                               | Version tracking                              |

### Observability

| Table      | Key Columns                                                    | Notes                      |
| ---------- | -------------------------------------------------------------- | -------------------------- |
| `ai_spans` | id, traceId, spanId, name, spanType, attributes, input, output | Mastra OTel bridge storage |

### Versioned Entities

All versioned entities follow the same pattern: a parent table with `status` (draft/active/archived) and `activeVersionId`, plus a versions table with `versionNumber` and entity-specific fields.

| Parent Table         | Versions Table               | Domain                                                  |
| -------------------- | ---------------------------- | ------------------------------------------------------- |
| `agents`             | `agent_versions`             | Agent definitions (instructions, model, tools, scorers) |
| `workspaces`         | `workspace_versions`         | Workspace config (filesystem, sandbox, search)          |
| `skills`             | `skill_versions`             | Skill definitions (instructions, assets, scripts)       |
| `scorer_definitions` | `scorer_definition_versions` | Scorer config (type, model, instructions, scoreRange)   |
| `prompt_blocks`      | `prompt_block_versions`      | Prompt blocks (content, rules)                          |
| `mcp_clients`        | `mcp_client_versions`        | MCP client configs (servers list)                       |
| `mcp_servers`        | `mcp_server_versions`        | MCP server registry (tools, version)                    |

### Other

| Table                | Key Columns                       | Notes                           |
| -------------------- | --------------------------------- | ------------------------------- |
| `resources`          | id, externalId, workingMemory     | Generic resource/user profiles  |
| `skill_blobs`        | hash (PK), content, size          | Content-addressable blob store  |
| `workflow_snapshots` | id, workflowName, runId, snapshot | Unique on (workflowName, runId) |

## Exports

### `@typhoon/db` (main entry)

| Export                                      | Description                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createDb(sqlOrConnectionString)`           | Factory for a Drizzle ORM client. Accepts a `postgres` `Sql` instance or a connection string. Returns a typed Drizzle client with all schemas loaded. |
| `createConnection(connectionString, opts?)` | Creates a fresh connection pool (`Sql`) and Drizzle client. Use for app-owned connections.                                                            |
| `Db`                                        | Type alias for the Drizzle client instance (`ReturnType<typeof createDb>`)                                                                            |
| `DbConnection`                              | Type for `{ db: Db; sql: Sql }`                                                                                                                       |
| Schema tables                               | All Drizzle table definitions (see schema overview above)                                                                                             |

### `@typhoon/db/repos`

All repository classes take a `Db` instance in their constructor and expose domain-specific data access methods.

| Repository       | Domain                    | Key Methods                                                                                                    |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DocumentRepo`   | Documents                 | `findById`, `listBySyncTarget`, `upsertBySourceKey`, `markReady`, `markError`, `markDeleted`, `metadataFields` |
| `SyncTargetRepo` | Sync targets              | CRUD for sync target configuration                                                                             |
| `SyncJobRepo`    | Sync jobs                 | Job lifecycle tracking (start, complete, fail, increment counters)                                             |
| `ThreadRepo`     | Chat threads              | Thread listing, filtering by resource                                                                          |
| `MessageRepo`    | Chat messages             | Message retrieval by thread                                                                                    |
| `FeedbackRepo`   | User feedback             | Create/list feedback with ratings                                                                              |
| `MetadataRepo`   | Metadata templates/groups | CRUD for field groups and templates                                                                            |
| `ReviewRepo`     | Score reviews             | Scoring workflow state management                                                                              |
| `ScoreRepo`      | Evaluation scores         | Score persistence and querying                                                                                 |
| `ScorerRepo`     | Scorer definitions        | Versioned scorer CRUD                                                                                          |
| `ExperimentRepo` | Experiments               | Experiment lifecycle                                                                                           |
| `FailedJobRepo`  | Failed jobs               | Archive and query failed BullMQ jobs                                                                           |
| `DashboardRepo`  | Analytics                 | Cost, latency, score series, worst threads                                                                     |
| `TraceRepo`      | Observability             | AI span querying and trace aggregation                                                                         |
| `PartitionRepo`  | Table partitioning        | Vector table partition management                                                                              |

### `@typhoon/db/drivers/pg`

| Export                | Description                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PgStore`             | Mastra `MastraCompositeStore` implementation backed by Drizzle. Provides domain storage for memory, workflows, scores, datasets, experiments, observability, agents, skills, workspaces, and more. |
| `PgVector`            | Mastra `MastraVector` implementation using pgvector. Manages vector table creation, upsert, query, and deletion. Supports HNSW, IVFFlat, and flat index types.                                     |
| `refineResults(opts)` | Post-retrieval refinement (optional reranking function).                                                                                                                                           |
| `sanitizeKey(key)`    | Filter key sanitization for safe SQL generation.                                                                                                                                                   |
| `PostgresStoreConfig` | Config type: `{ id, connectionString }` or `{ id, db, sql }` for sharing a connection.                                                                                                             |
| `PgVectorConfig`      | Config type: `{ id, connectionString }` or `{ id, sql }`.                                                                                                                                          |

## Usage Examples

### Creating a database connection (app composition root)

```typescript
import { createConnection } from '@typhoon/db/connection';

const { db, sql } = createConnection(process.env.DATABASE_URL);
```

### Using repositories (service layer)

```typescript
import { DocumentRepo, SyncTargetRepo } from '@typhoon/db/repos';
import { createConnection } from '@typhoon/db/connection';

const { db } = createConnection(process.env.DATABASE_URL);
const documentRepo = new DocumentRepo(db);
const syncTargetRepo = new SyncTargetRepo(db);

// Find a document
const doc = await documentRepo.findById('doc-uuid');

// Upsert on sync
const row = await documentRepo.upsertBySourceKey({
  syncTargetId: 'target-uuid',
  sourceKey: 'documents/report.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  status: 'processing',
});

// Introspect metadata field distribution
const fields = await documentRepo.metadataFields('target-uuid');
```

### Setting up Mastra PgStore and PgVector

```typescript
import { PgStore, PgVector } from '@typhoon/db/drivers/pg';

// Option 1: Own connection (PgStore creates its own pool)
const store = new PgStore({
  id: 'typhoon-store',
  connectionString: process.env.DATABASE_URL,
});

// Option 2: Shared connection (reuse an existing pool)
import { createConnection } from '@typhoon/db/connection';
const { db, sql } = createConnection(process.env.DATABASE_URL);
const store = new PgStore({ id: 'typhoon-store', db, sql });

// PgVector for embedding storage
const vector = new PgVector({
  id: 'typhoon-vector',
  connectionString: process.env.DATABASE_URL,
});

// Use in Mastra configuration
const mastra = new Mastra({
  storage: store,
  vectors: { pgVector: vector },
});
```

## Migration Workflow

Schema changes follow the Drizzle Kit workflow:

```bash
# 1. Modify schema files in src/schema/
# 2. Generate migration SQL
bun run db:generate

# 3. Review generated files in packages/db/drizzle/
# 4. Run the migration
bun run db:migrate

# 5. (Dev only) Push schema directly without migration files
bun run db:push
```

The Drizzle config (`drizzle.config.ts`) reads from `DATABASE_URL` and outputs migrations to `./drizzle/`.

## Configuration

| Variable       | Required | Description                                                                     |
| -------------- | -------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL` | Yes      | PostgreSQL connection string (e.g., `postgres://user:pass@localhost:5432/typhoon`) |

## Dependencies

| Package        | Purpose                               |
| -------------- | ------------------------------------- |
| `drizzle-orm`  | ORM and query builder                 |
| `postgres`     | PostgreSQL driver (postgres.js)       |
| `@mastra/core` | Base classes for PgStore and PgVector |
| `@typhoon/config` | Environment variable validation       |
| `@typhoon/types`  | Shared TypeScript types               |

## Cross-References

- [Database documentation](../../docs/database/)
- [Architecture overview](../../docs/architecture.md)
- [Infrastructure guide](../../docs/infrastructure.md)
- [Environment variables reference](../../docs/environment-variables.md)
