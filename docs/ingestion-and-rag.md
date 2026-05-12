# Ingestion & RAG

## Overview

Typhoon ingests documents from S3/MinIO, processes them through a RAG pipeline, and stores vector embeddings in PostgreSQL (pgvector) for semantic search.

```
S3 Bucket ──► Sync Scan ──► Parse ──► MDocument ──► Chunk ──► Embed ──► pgvector
                 │                                                         │
                 ├── New files ──► process-file job                        │
                 ├── Updated files ──► delete old vectors + re-process     │
                 └── Deleted files ──► delete-file job                     │
                                                                           │
                              Agent Query ──► createVectorQueryTool ──► Search
```

## S3 Sync Pipeline

**Package:** `packages/ingestion/src/sync.ts`

The sync pipeline detects changes in S3 buckets by comparing the current listing against the `documents` table in PostgreSQL.

**Change detection:** ETag-based comparison
- **New:** Key exists in S3 but not in the database
- **Updated:** Key exists in both but ETags differ
- **Deleted:** Key exists in the database but not in S3

### BullMQ Jobs

**Package:** `packages/ingestion/src/jobs/`

| Job | Queue | Trigger | Description |
|-----|-------|---------|-------------|
| `scan` | sync | Repeatable cron (default 6h) | Lists S3 objects, diffs against DB, enqueues per-file jobs |
| `process-file` | sync | Enqueued by scan | Downloads, parses, chunks, embeds, upserts to pgvector |
| `delete-file` | sync | Enqueued by scan | Removes vectors from pgvector, marks document as deleted |

## Document Parsing

**Package:** `packages/ingestion/src/parsers/`

Binary and markup formats are run through custom parsers that convert them to markdown before chunking. Plain text, markdown, and JSON are passed directly to `MDocument`.

| Format | Parser | MDocument Method |
|--------|--------|-----------------|
| PDF | `unpdf` + spatial analysis (headings, tables, lists) | `MDocument.fromMarkdown()` |
| DOCX | `mammoth` → turndown + GFM tables | `MDocument.fromMarkdown()` |
| XLSX | SheetJS → CSV | `MDocument.fromText()` |
| HTML (.html/.htm) | turndown + GFM tables | `MDocument.fromMarkdown()` |
| Markdown (.md/.mdx) | Native | `MDocument.fromMarkdown()` |
| Plain text | Native | `MDocument.fromText()` |
| JSON | Native | `MDocument.fromJSON()` |

## Chunking

**Package:** `packages/ingestion/src/pipeline.ts`

Uses Mastra's `MDocument.chunk()` with format-aware strategies. All strategies include `addStartIndex: true` so each chunk records its byte offset in the source text.

| Format | Strategy | Description |
|--------|----------|-------------|
| Markdown | `semantic-markdown` | Semantic boundary splitting; 500-token join threshold, `EMBEDDING_MAX_CHARS` max size, 50-token overlap |
| HTML | `html` | Respects heading hierarchy (h1→title, h2→section, h3→subsection); `EMBEDDING_MAX_CHARS` max size |
| JSON | `token` | Token-based splitting; 512 max, 50 overlap |
| All others | `sentence` | Sentence-boundary splitting; 512 max, 50 overlap |

After chunking, a safety net (`enforceChunkSizeLimit`) splits any chunk exceeding `EMBEDDING_MAX_CHARS` on paragraph, sentence, or hard character boundaries. Empty/whitespace-only chunks are filtered out.

## Metadata Extraction

**Package:** `packages/ingestion/src/pipeline.ts`

Two LLM passes run via `LLM_EXTRACTION_MODEL` during ingestion:

1. **Per-chunk keywords** — up to 5 keywords extracted per chunk; stored in vector metadata as `keywords`
2. **Document title + description** — generated from the first 2,000 characters of content; title is stored in vector metadata and in the `documents` table

## Embedding

Chunks are embedded via the configured OpenAI-compatible endpoint (`EMBEDDING_BASE_URL`). The model and dimension are configured via `EMBEDDING_MODEL` and `EMBEDDING_DIMENSION`.

### Adaptive Ratio Tracking

A per-document `TokenRatioTracker` learns the chars-per-token ratio from successful embeds. On the first chunk, the ratio is unknown and the ceiling is `EMBEDDING_MAX_CHARS`. As chunks embed successfully and the provider returns token usage, the tracker computes `safeMaxChars = EMBEDDING_MAX_TOKENS * measured_ratio * 0.9`. Subsequent chunks that exceed this adaptive limit are proactively split *before* calling the API — avoiding wasted API calls. Splitting and embedding are interleaved so each chunk's split decision uses the latest ratio.

### Retry on Failure

If any embed call fails (regardless of error type), the chunk is split in half and retried recursively (up to 3 levels). This handles cold-start failures (before the ratio calibrates), transient errors, and unknown error formats from different providers.

### Batching

When `EMBEDDING_BATCH_SIZE` is set >1, chunks are sent in batches via `embedMany`. If a batch fails or returns the wrong count, the pipeline falls back to per-chunk embedding with retry. Default is 1 (per-chunk only).

### Observability

The embedding stage records:
- **OTel span** (`processFile`) with attributes: chunk count, min/max/avg chunk chars, retries, proactive splits, total tokens, chars-per-token ratio
- **Metrics:** `embed.chunk.size_chars` (histogram), `embed.retry` (counter), `embed.token_usage` (histogram)
- **Summary log** at pipeline end with all stats including per-stage timing
- **Debug logs** per-chunk (index, chars, preview) and per-embed (success/retry)

## Vector Storage

**Technology:** pgvector (PostgreSQL extension) via Mastra's `PgVector`

```typescript
await vectorStore.upsert({
  indexName: 'knowledge_base',
  vectors: embeddings,
  metadata: chunks.map((chunk, i) => ({
    text: chunk.text,
    documentId,
    syncTargetId,
    source: sourceKey,
    title: docTitle,
    keywords: chunk.metadata?.excerptKeywords ?? '',
    startIndex: startIndices[i],
  })),
});
```

## Search

The Knowledge Agent has two search tools:

### Hybrid Search (default)

Combines BM25 keyword matching with vector similarity using weighted Reciprocal Rank Fusion (RRF). The tool supports a `rerank` toggle via `createHybridSearchTool({ rerank })`:

- **`rerank: true` (default for standalone use):** Inflates retrieval to `RAG_RERANK_CANDIDATES` (default 100), reranks via Cohere Rerank, returns top `topK` results.
- **`rerank: false` (used inside composite `searchKnowledge`):** Returns broad un-reranked candidates for downstream reranking.

```typescript
// Two-stage retrieve-then-rerank:
// 1. Retrieve broadly: BM25 + vector → RRF → RAG_RERANK_CANDIDATES results
const retrievalK = Math.max(RAG_RERANK_CANDIDATES, topK);
const results = await vectorStore.hybridQuery({
  indexName: 'knowledge_base',
  queryText,
  queryVector: embedding,
  topK: retrievalK,
});

// 2. Rerank: dedup → cross-encoder rerank → minScore filter → top K
const refined = await refineResults(results, queryText, {
  minScore: RAG_RERANK_MIN_SCORE,
  dedupKey: 'chunkId',
  reranker: (r, q) => rerankWithScorer({
    results: r,
    query: q,
    scorer: rerankerScorer,  // RerankerScorer — calls Cohere-compatible /rerank endpoint
    options: { weights: RAG_RERANK_WEIGHTS, topK },
  }),
});
```

### Shared Retrieval Pipeline (`refineResults`)

**Package:** `packages/db/src/drivers/pg/retrieval.ts`

Both the agent search tools and the `/v1/search/hybrid` API endpoint use `refineResults` for post-query processing. The pipeline stages run in order, each independently optional:

1. **Dedup** by metadata key (keeps highest-scoring entry per key)
2. **Rerank** via dedicated reranker (`RerankerScorer` calls a Cohere-compatible `/rerank` endpoint with automatic batching)
3. **minScore filter** (applied last — RRF scores are small fractions; reranked scores are normalized 0-1)

| Consumer | dedupKey | reranker | minScore | Retrieval inflation |
|----------|----------|----------|----------|---------------------|
| Agent hybrid tool (standalone) | `chunkId` | yes | `RAG_RERANK_MIN_SCORE` | `RAG_RERANK_CANDIDATES` |
| Agent hybrid tool (in composite) | — | no | — | `RAG_RERANK_CANDIDATES` |
| Composite `searchKnowledge` | by `chunkId` | yes (semantic-only weights) | `RAG_RERANK_MIN_SCORE` | — (uses sub-tool results) |
| Search API (default) | `documentId` | yes | `RAG_RERANK_MIN_SCORE` | `RAG_RERANK_CANDIDATES` |
| Search API (expanded) | `chunkId` | yes | `RAG_RERANK_MIN_SCORE` | `RAG_RERANK_CANDIDATES_EXPANDED` |
| Vector API (rerank=true) | — | yes | `RAG_RERANK_MIN_SCORE` | `RAG_RERANK_CANDIDATES` |

### Graph Search

Uses `createGraphRAGTool` from `@mastra/rag` for relationship and comparison queries across documents.

### Search Pipeline (Two-Stage Retrieval)

The `searchKnowledge` composite tool orchestrates a two-stage retrieve-then-rerank pipeline:

**Stage 1 — Broad recall (sub-tools, no individual reranking):**
The knowledge agent calls hybrid and/or graph tools with `rerank: false`. Sub-tools retrieve `RAG_RERANK_CANDIDATES` candidates each, returning broad, un-reranked results.

**Stage 2 — Precision reranking (composite tool):**
1. Results from all sub-tools are merged
2. Deduped by chunk ID (highest original score wins)
3. Combined set is reranked via the shared `refineResults` pipeline with `rerankWithScorer` using semantic-only weights (`{ semantic: 1.0, vector: 0, position: 0 }` — no blending with original scores since sources come from different tools with incompatible score scales)
4. Filtered: score >= `RAG_RERANK_MIN_SCORE`, capped at `RAG_KNOWLEDGE_MAX_RESULTS`
5. Grouped by document for hierarchical citation indices (`[Source: N.M]`)
6. Second LLM call generates a cited response
7. Post-processing: only cited chunks are kept, display indices renumbered sequentially
8. Graph tool IDs (numeric node indices) resolved to real vector store chunk IDs

### Citation Storage & Hydration

Messages store minimal `_chunkSources` references (`{ chunkId, displayIndex }` only) to reduce DB size and LLM token overhead on conversation replay. Full metadata (title, section, documentId, etc.) is hydrated from the vector store when a thread is loaded via `hydrateChunkSources()` in the threads API route.

Key files:
- `packages/db/src/drivers/pg/strip-chunks.ts` — strips metadata before DB write
- `apps/api/src/routes/hydrate-chunks.ts` — batch-fetches metadata on thread load
- `packages/db/src/drivers/pg/vector.ts` (`getChunksByIds`) — vector store lookup

Each chunk source is tagged with `searchTool` (hybrid or graph) for observability. Debug logging captures tool selection, raw/filtered counts, and score distributions.

## Database Tables

The ingestion pipeline uses four tables defined in `packages/db/src/schema/`:

| Table | Purpose |
|-------|---------|
| `sync_targets` | S3 bucket configurations (name, bucket, prefix, cron schedule) |
| `documents` | Document metadata (S3 key, ETag, status, chunk count) |
| `sync_jobs` | Sync job tracking (files scanned, new, updated, deleted, errors) |
| `feedback` | Rep feedback on AI responses (rating, comment) |
