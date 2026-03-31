# @typhoon/pg

Custom PostgreSQL storage layer implementing Mastra's storage interfaces with Drizzle ORM schemas from `@typhoon/db`. Replaces `@mastra/pg` with stronger type safety, SQL injection prevention, batched operations, and UUID-based FK relationships.

## Architecture

```
PostgresStore (MastraCompositeStore)
├── memory     → DrizzleMemoryStorage    (threads, messages, resources)
├── workflows  → DrizzleWorkflowsStorage (workflow_snapshots)
├── scores     → DrizzleScoresStorage
├── datasets   → DrizzleDatasetsStorage
├── experiments→ DrizzleExperimentsStorage
├── observability → DrizzleObservabilityStorage (ai_spans)
├── agents     → DrizzleAgentsStorage     ┐
├── skills     → DrizzleSkillsStorage     │
├── workspaces → DrizzleWorkspacesStorage │ All extend
├── promptBlocks → DrizzlePromptBlocksStorage │ VersionedStorageHelper
├── scorerDefinitions → DrizzleScorerDefinitionsStorage │
├── mcpClients → DrizzleMCPClientsStorage │
├── mcpServers → DrizzleMCPServersStorage ┘
└── blobs      → DrizzleBlobsStorage      (skill_blobs)

PgVector (MastraVector)
└── pgvector HNSW indexes for RAG / semantic recall
```

**Two connection modes:**
- **Shared** (`{ db, sql }`): Reuses an existing Drizzle + postgres.js connection. Package does not own lifecycle.
- **Owned** (`{ connectionString }`): Creates its own connection. Closed via `PostgresStore.close()`.

## Dual-ID Pattern

Mastra generates non-UUID identifiers for memory tables:

| Table | Mastra ID format | Example |
|-------|-----------------|---------|
| threads | `{parentUUID}-{childUUID}` (sub-agents) | `95aa6d43-...-21170f1d-...` |
| messages | nanoid or `msg_{uuid}` | `m2tuvLyrJMFgddK4` |
| resources | `{uuid}-{agentName}` (sub-agents) | `e755014a-...-knowledgeAgent` |

These tables use a dual-ID approach:
- `id` — internal `uuid` PK (auto-generated, used for FK joins)
- `external_id` — `text UNIQUE` (Mastra's original ID)

The mapping is fully transparent. Mastra and the API only see `external_id` (returned as `id`). The internal uuid is never exposed.

```
Mastra sends: threadId = "95aa6d43-...-21170f1d-..."
                ↓
memory.ts:  saves as external_id, auto-generates uuid id
                ↓
Database:   id = <uuid>, external_id = "95aa6d43-...-21170f1d-..."
                ↓
memory.ts:  returns { id: external_id } to Mastra
                ↓
Mastra sees: threadId = "95aa6d43-...-21170f1d-..." (unchanged)
```

All other tables use `uuid` PKs directly — their IDs come from `crypto.randomUUID()`.

## SQL Injection Prevention

Dynamic metadata keys and column names are validated before interpolation:

- **`sanitizeKey()`** (`vector/filter.ts`): Validates JSONB metadata filter keys against `^[a-zA-Z_][a-zA-Z0-9_.]*$`. Used by `buildFilterQuery()` and memory metadata filters.
- **`validateColumnName()`** (`storage/versioned.ts`): Column allowlist for versioned entity CRUD.
- **`validateColumn()`** (`storage/validate-columns.ts`): Per-table allowlists for scores, experiments, datasets, and observability tables.

When adding new columns to any table, update the corresponding allowlist.

## File Map

### Core
| File | Purpose |
|------|---------|
| `src/index.ts` | Package exports: `PostgresStore`, `PgVector`, config types |
| `src/config.ts` | `PostgresStoreConfig`, `PgVectorConfig` type definitions |
| `src/connection.ts` | Connection resolution (shared vs owned) |

### Storage (`src/storage/`)
| File | Domain | Backend |
|------|--------|---------|
| `index.ts` | `PostgresStore` composite — wires all domains | — |
| `memory.ts` | Threads, messages, resources (dual-ID) | Drizzle ORM |
| `workflows.ts` | Workflow snapshots | Drizzle ORM |
| `scores.ts` | Scoring results | Raw SQL |
| `datasets.ts` | Datasets, items, versions | Raw SQL |
| `experiments.ts` | Experiments and results | Raw SQL |
| `observability.ts` | AI spans / tracing | Raw SQL |
| `agents.ts` | Agent entities (versioned) | VersionedStorageHelper |
| `skills.ts` | Skill entities (versioned) | VersionedStorageHelper |
| `workspaces.ts` | Workspace entities (versioned) | VersionedStorageHelper |
| `prompt-blocks.ts` | Prompt block entities (versioned) | VersionedStorageHelper |
| `scorer-definitions.ts` | Scorer definition entities (versioned) | VersionedStorageHelper |
| `mcp-clients.ts` | MCP client entities (versioned) | VersionedStorageHelper |
| `mcp-servers.ts` | MCP server entities (versioned) | VersionedStorageHelper |
| `blobs.ts` | Skill blob content storage | Raw SQL |
| `versioned.ts` | Generic CRUD + versioning helper for all 7 versioned domains | Raw SQL |
| `validate-columns.ts` | Column allowlists for SQL injection prevention | — |

### Vector (`src/vector/`)
| File | Purpose |
|------|---------|
| `index.ts` | `PgVector` — pgvector HNSW index management, semantic search |
| `filter.ts` | MongoDB-style filter → PostgreSQL JSONB WHERE clause builder |

## Configuration

```ts
import { PostgresStore, PgVector } from '@typhoon/pg';

// Shared connection (recommended — reuse app's connection pool)
const storage = new PostgresStore({ id: 'typhoon', db, sql });
const vector = new PgVector({ id: 'typhoon-vectors', sql });

// Owned connection (creates its own pool)
const storage = new PostgresStore({ id: 'typhoon', connectionString: DATABASE_URL });
const vector = new PgVector({ id: 'typhoon-vectors', connectionString: DATABASE_URL });
```

## Testing

Tests are integration tests that require a running PostgreSQL instance with pgvector:

```bash
DATABASE_URL="postgresql://typhoon:typhoon@localhost:5432/typhoon" bun run test
```

Tests are skipped when `DATABASE_URL` is not set. All test IDs use `crypto.randomUUID()` to match the uuid schema.
