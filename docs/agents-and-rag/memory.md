# Memory

Typhoon uses Mastra's memory system to persist conversation history and optionally support semantic recall and working memory. Memory is configured per-agent and backed by PostgreSQL.

## Three Tiers

Mastra's `Memory` class supports three tiers of memory:

| Tier                | Description                                          | Current Config   |
| ------------------- | ---------------------------------------------------- | ---------------- |
| **Message history** | Recent messages from the thread                      | Last 20 messages |
| **Semantic recall** | Embedding-based retrieval of older relevant messages | Disabled         |
| **Working memory**  | Persistent scratchpad (updated by the agent)         | Disabled         |

## Current Configuration

The supervisor's memory is configured in `apps/api/src/mastra/index.ts`:

```typescript
const supervisorMemory = new Memory({
  storage,
  vector: pgVector,
  embedder: createEmbeddingModel(),
  options: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemory: { enabled: false },
  },
});
```

### Message History

The last 20 messages from the current thread are included in the agent's context. This provides conversational continuity without consuming excessive token budget.

### Semantic Recall (Disabled)

When enabled, Mastra would embed messages and use vector similarity to retrieve older relevant messages from the thread. Currently disabled because the last-20-messages window is sufficient for Typhoon's customer service use case.

### Working Memory (Disabled)

When enabled, Mastra would maintain a persistent scratchpad that the agent can read and write across turns. Currently disabled. If enabled, the `resources` table's `working_memory` column would store the persisted state.

## Storage Backends

### PostgresStore

Thread and message persistence is handled by Mastra's `PostgresStore`:

```typescript
const storage = new PostgresStore({
  id: 'typhoon-storage',
  db,
  sql,
});
```

This manages the `threads`, `messages`, and `resources` tables defined in `packages/db/src/schema/`.

### PgVector

Vector storage for semantic recall (when enabled) uses Mastra's `PgVector`:

```typescript
const pgVector = new PgVector({
  id: 'typhoon-vectors',
  sql,
});
```

This is the same vector store used for the knowledge base (`knowledge_base` index), but semantic recall would use a separate index.

## Agent Memory Assignments

| Agent            | Has Memory        | Rationale                                       |
| ---------------- | ----------------- | ----------------------------------------------- |
| Supervisor       | Yes (20 messages) | Needs conversation context for multi-turn chat  |
| Knowledge Agent  | No (by default)   | Stateless retrieval sub-agent                   |
| Experiment Agent | No                | Each experiment item is independent             |
| Widget Agent     | No                | Uses supervisor via API (supervisor has memory) |

The knowledge agent accepts an optional `memory` parameter in `KnowledgeAgentOptions` but it is not used in the default configuration.

## Thread and Resource Isolation

Memory is scoped by `threadId` and `resourceId`:

- **Thread** -- each conversation has a unique thread ID. Messages are stored per-thread.
- **Resource** -- represents a user or session. Threads are listed per-resource for the UI.

The `ThreadRepo` provides the custom query layer on top of Mastra's storage for features like listing threads with pagination and updating titles.

## Memory Creation Pattern

```typescript
import { Memory } from '@mastra/memory';

const memory = new Memory({
  storage, // PostgresStore instance
  vector: pgVector, // PgVector instance (for semantic recall)
  embedder: createEmbeddingModel(), // Embedding model (for semantic recall)
  options: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemory: { enabled: false },
  },
});

const agent = new Agent({
  id: 'my-agent',
  model: createChatModel(),
  instructions: '...',
  memory,
  // ...
});
```

## Changing Memory Settings

To adjust the message history window, modify `lastMessages` in the memory options. To enable semantic recall:

```typescript
const memory = new Memory({
  storage,
  vector: pgVector,
  embedder: createEmbeddingModel(),
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 5, // Number of similar messages to retrieve
      minScore: 0.7, // Minimum similarity threshold
    },
    workingMemory: { enabled: false },
  },
});
```

To enable working memory, set `workingMemory: { enabled: true }`. The agent will need a `updateWorkingMemory` tool (provided automatically by Mastra) to write to the scratchpad.

## Related

- [Supervisor](./supervisor.md) -- the agent that uses memory
- [Guardrails](./guardrails.md) -- processors that run on messages before/after memory
