# Search Tools

All tools available to the agent system. Tools are defined in `packages/agents/src/tools/`.

## searchKnowledge (Composite Tool)

**File:** `packages/agents/src/tools/knowledge-search.ts`

The primary search interface used by the supervisor. Orchestrates a two-phase retrieve-then-cite pipeline.

### Input Schema

```typescript
{
  prompt: string; // The user question to answer from the knowledge base
}
```

### Output Schema

```typescript
{
  text: string           // Answer with inline [Source: N] citations
  _chunkSources?: Array<{
    index: number        // Sequential position
    displayIndex: string // Citation label (e.g. "1", "2.1")
    chunkId: string      // Vector store chunk ID
    title: string        // Document title
    section: string      // Section heading
    text: string         // Chunk preview (first 200 chars)
    source: string       // Source file path
    syncTargetName: string
    documentId: string
    startIndex: number   // Byte offset in source document
    score: number        // Reranker score
    searchTool: string   // "hybrid" or "graph"
  }>
}
```

### Two-Phase Pipeline

**Phase 1 -- Retrieve:**

1. Optionally prepend metadata context to the query
2. Call the knowledge agent with `toolChoice: 'auto'`, `maxSteps: 7`
3. Extract tool results from all steps (skip `updateWorkingMemory`)
4. Collect source chunks from all search tool results
5. Deduplicate by `chunkId` (keep highest score)
6. Rerank combined results via `refineResults` with semantic-only weights
7. Filter by `RAG_RERANK_MIN_SCORE`, cap at `RAG_KNOWLEDGE_MAX_RESULTS`
8. Group by document for hierarchical citation indices

**Phase 2 -- Cite:**

1. Build a source summary grouped by document
2. Call `LLM_CITATION_MODEL` with structured output to generate `{ answer, citedRefs }`
3. Keep only cited chunks, renumber display indices sequentially
4. Rewrite `[Source: X]` markers in the text with new sequential indices
5. Resolve graph tool fake IDs (numeric node indices) to real vector store chunk IDs

### Factory

```typescript
function createKnowledgeSearchTool(knowledgeAgent: Agent, options?: KnowledgeSearchToolOptions): Tool;

interface KnowledgeSearchToolOptions {
  getMetadataContext?: () => Promise<string | undefined>;
}
```

---

## searchKnowledgeBaseHybrid

**File:** `packages/agents/src/tools/search-kb-hybrid.ts`

Combines BM25 keyword matching with vector similarity using weighted Reciprocal Rank Fusion (RRF).

### Input Schema

```typescript
{
  queryText: string          // Search query (max EMBEDDING_MAX_CHARS)
  topK: number               // Results to return (1-100, default 15)
  filter?: Record<string, unknown>  // MongoDB-style metadata filter
}
```

### Output Schema

```typescript
{
  sources: Array<{
    id: string
    metadata: Record<string, unknown>
    score: number
    document: string
    vector: []
  }>
  rerank?: RerankMetrics  // Only when reranking is enabled
}
```

### Behavior

1. Embed the query via `createEmbeddingModel()`
2. Run `vectorStore.hybridQuery()` with the text query and embedding vector
3. Retrieval depth is inflated to `RAG_RERANK_CANDIDATES` (default 100) to give the reranker a broad pool
4. If `rerank: true` (default for standalone): run `refineResults` with Cohere cross-encoder
5. If `rerank: false` (inside composite tool): return raw RRF-scored results

### Factory

```typescript
function createHybridSearchTool(options?: HybridSearchToolOptions): Tool;

interface HybridSearchToolOptions {
  rerank?: boolean; // Default: true
}
```

The module exports a pre-built default: `searchKnowledgeBaseHybrid` (with `rerank: true`).

---

## searchKnowledgeBaseGraph

**File:** `packages/agents/src/tools/graph-kb.ts`

Uses Mastra's `createGraphRAGTool` for graph-based retrieval. Finds relationships between documents for comparison and cross-topic queries.

### Configuration

| Setting              | Value                                |
| -------------------- | ------------------------------------ |
| Vector store         | `pgVector`                           |
| Index                | `knowledge_base`                     |
| Embedding model      | `createEmbeddingModel()`             |
| Filter support       | Enabled                              |
| Dimension            | `EMBEDDING_DIMENSION` (default 1024) |
| Similarity threshold | `RAG_GRAPH_THRESHOLD` (default 0.7)  |

### Progress Messages

The tool is wrapped with `withProgress` to emit SSE progress events:

- Start: "Walking the document graph for related context..."
- Done: "Returned N connected chunks." or "No connected chunks found."

---

## searchKnowledgeBase (Vector-Only)

**File:** `packages/agents/src/tools/search-kb.ts`

A vector-only search tool using Mastra's `createVectorQueryTool`. Not currently used by the knowledge agent (replaced by hybrid search) but exported for potential direct use.

### Factory

```typescript
function createVectorSearchTool(options?: VectorSearchToolOptions): Tool;

interface VectorSearchToolOptions {
  rerank?: boolean; // Default: true
}
```

---

## setThreadTitle

**File:** `packages/agents/src/tools/set-thread-title.ts`

Generates and saves a short title for the current conversation thread.

### Input Schema

```typescript
{
  userMessage: string; // The user message to generate a title from
}
```

### Output Schema

```typescript
{
  title: string; // Generated title (max 80 chars)
}
```

### Behavior

1. Check if the thread already has a title -- skip if so
2. Use `LLM_TITLE_MODEL` with structured output to generate a title
3. Update the thread via Mastra's memory store
4. Only called on the first message in a conversation

---

## Progress Emission

All search tools emit real-time progress messages via SSE using the `emitToolProgress` utility (`packages/agents/src/tools/with-progress.ts`). The `withProgress` wrapper provides a declarative way to add start/done progress messages to any tool.

## Related

- [Retrieval Pipeline](./retrieval-pipeline.md) -- the `refineResults` function
- [Citations](./citations.md) -- the citation generation and storage lifecycle
- [Knowledge Agent](./knowledge-agent.md) -- the agent that uses these tools
