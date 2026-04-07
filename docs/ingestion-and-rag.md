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
| Markdown | `semantic-markdown` | Semantic boundary splitting; 500-token join threshold, 50-token overlap |
| HTML | `html` | Respects heading hierarchy (h1→title, h2→section, h3→subsection) |
| JSON | `token` | Token-based splitting; 512 max, 50 overlap |
| All others | `sentence` | Sentence-boundary splitting; 512 max, 50 overlap |

## Metadata Extraction

**Package:** `packages/ingestion/src/pipeline.ts`

Two LLM passes run via `LLM_EXTRACTION_MODEL` during ingestion:

1. **Per-chunk keywords** — up to 5 keywords extracted per chunk; stored in vector metadata as `keywords`
2. **Document title + description** — generated from the first 2,000 characters of content; title is stored in vector metadata and in the `documents` table

## Embedding

Embeddings are generated via `embedMany()` from the `ai` package using the configured OpenAI-compatible embedding endpoint (`EMBEDDING_BASE_URL`). The model and dimension are configured via `EMBEDDING_MODEL` and `EMBEDDING_DIMENSION` environment variables.

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

The Knowledge Agent uses Mastra's `createVectorQueryTool` for semantic search:

```typescript
const searchKnowledgeBase = createVectorQueryTool({
  vectorStoreName: 'pgVector',
  indexName: 'knowledge_base',
  model: createEmbeddingModel(),
});
```

This tool is automatically invoked by the agent when a user asks a question. Results include the matched text, relevance score, and source metadata.

## Database Tables

The ingestion pipeline uses four tables defined in `packages/db/src/schema/`:

| Table | Purpose |
|-------|---------|
| `sync_targets` | S3 bucket configurations (name, bucket, prefix, cron schedule) |
| `documents` | Document metadata (S3 key, ETag, status, chunk count) |
| `sync_jobs` | Sync job tracking (files scanned, new, updated, deleted, errors) |
| `feedback` | Rep feedback on AI responses (rating, comment) |
