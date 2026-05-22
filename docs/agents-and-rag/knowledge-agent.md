# Knowledge Agent

The knowledge agent is a retrieval-focused sub-agent that searches the knowledge base and returns raw search results. It does not synthesize or generate citations -- that is handled by the composite `searchKnowledge` tool in Phase 2.

## Factory

```typescript
function createKnowledgeAgent(options?: KnowledgeAgentOptions): Agent;

interface KnowledgeAgentOptions {
  memory?: MastraMemory;
  /** Set to false when caller will rerank the merged result set. Default: true. */
  rerank?: boolean;
}
```

**Package:** `packages/agents/src/knowledge.ts`

## Configuration

| Setting     | Value                                                  |
| ----------- | ------------------------------------------------------ |
| Agent ID    | `knowledge`                                            |
| Model       | `LLM_KNOWLEDGE_MODEL` (falls back to `LLM_CHAT_MODEL`) |
| Temperature | 0                                                      |
| Tool choice | `required` (must call at least one search tool)        |
| Memory      | Optional (disabled by default)                         |
| Max steps   | 7 (when called from composite tool)                    |

## Tools

The knowledge agent has two search tools:

| Tool                        | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `searchKnowledgeBaseHybrid` | BM25 + vector hybrid search with RRF fusion               |
| `searchKnowledgeBaseGraph`  | Graph-based retrieval for relationship/comparison queries |

When `rerank: false` is passed (used inside the composite `searchKnowledge` tool), the hybrid tool returns broad, un-reranked candidates for downstream reranking.

## Instructions

The agent's instructions define:

1. **Always search** -- the agent must call search tools before responding.
2. **Tool selection** -- default is to call both tools in parallel for best coverage. Use only hybrid search for straightforward single-topic lookups.
3. **Verbatim queries** -- the user's full question is passed verbatim to every tool. Never split, rephrase, or summarize.
4. **No narration** -- the agent should just call tools, not write commentary.

## Metadata Filtering

The instructions include detailed guidance on using metadata filters:

### Filter Syntax

The agent supports MongoDB-style filter operators:

| Operator      | Description             | Example                                        |
| ------------- | ----------------------- | ---------------------------------------------- |
| `$eq`         | Equals                  | `{ "field": "value" }`                         |
| `$ne`         | Not equals              | `{ "field": { "$ne": "value" } }`              |
| `$gt`, `$gte` | Greater than (or equal) | `{ "field": { "$gt": 5 } }`                    |
| `$lt`, `$lte` | Less than (or equal)    | `{ "field": { "$lt": 10 } }`                   |
| `$in`         | In array                | `{ "field": { "$in": ["a", "b"] } }`           |
| `$nin`        | Not in array            | `{ "field": { "$nin": ["x"] } }`               |
| `$regex`      | Regex match             | `{ "field": { "$regex": "pattern" } }`         |
| `$contains`   | Contains substring      | `{ "source": { "$contains": "handbook" } }`    |
| `$and`        | Logical AND             | `{ "$and": [{ "f1": "v1" }, { "f2": "v2" }] }` |
| `$or`         | Logical OR              | `{ "$or": [{ "f1": "v1" }, { "f2": "v2" }] }`  |

### Metadata Context Injection

When the supervisor's `getMetadataContext` callback is configured, the composite `searchKnowledge` tool prepends available metadata fields and values to the user's query:

```
User question: What is the refund policy for electronics?

Available metadata fields and values:
category: general, electronics, clothing | region: US, EU, APAC
```

This allows the knowledge agent to auto-detect relevant filters from the conversation context and apply them to search queries.

### Default/Catch-All Values

When filtering by a metadata field that has a default or catch-all value (e.g., a "general" category), the agent includes both the specific value and the default in an `$in` filter to avoid excluding general-purpose documents:

```json
{ "category": { "$in": ["electronics", "general"] } }
```

## Rerank Toggle

The knowledge agent supports a `rerank` option that controls whether individual search tools rerank their results:

- **`rerank: true` (default)** -- each search tool reranks independently. Used when the knowledge agent operates standalone.
- **`rerank: false`** -- search tools return broad, un-reranked candidates. Used inside the composite `searchKnowledge` tool, which performs its own cross-tool reranking in Phase 2.

This avoids double-reranking while still allowing standalone use of the knowledge agent with reranking.

## Related

- [Search Tools](./search-tools.md) -- detailed documentation for each search tool
- [Retrieval Pipeline](./retrieval-pipeline.md) -- the refineResults pipeline
- [Metadata Filtering](./metadata-filtering.md) -- the metadata system end-to-end
