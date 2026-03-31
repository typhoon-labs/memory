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

Mastra's `MDocument` handles markdown, HTML, JSON, and plain text natively. Custom parsers extract text from binary formats before passing to `MDocument`.

| Format | Parser | MDocument Method |
|--------|--------|-----------------|
| PDF | `unpdf` | `MDocument.fromText()` |
| DOCX | `mammoth` (converts to HTML) | `MDocument.fromHTML()` |
| XLSX | SheetJS (converts to CSV) | `MDocument.fromText()` |
| Markdown | Native | `MDocument.fromMarkdown()` |
| HTML | Native | `MDocument.fromHTML()` |
| Plain text | Native | `MDocument.fromText()` |
| JSON | Native | `MDocument.fromJSON()` |

## Chunking

**Package:** `packages/ingestion/src/pipeline.ts`

Uses Mastra's `MDocument.chunk()` with format-aware strategies:

| Format | Strategy | Description |
|--------|----------|-------------|
| Markdown | `markdown` | Respects heading structure |
| HTML | `html` | Respects HTML element boundaries |
| All others | `recursive` | Smart splitting on paragraphs, sentences |

**Parameters:**
- `maxSize`: 512 tokens
- `overlap`: 50 tokens

## Embedding

Embeddings are generated via `embedMany()` from the `ai` package using the configured OpenAI-compatible embedding endpoint (`EMBEDDING_BASE_URL`). The model and dimension are configured via `EMBEDDING_MODEL` and `EMBEDDING_DIMENSION` environment variables.

## Vector Storage

**Technology:** pgvector (PostgreSQL extension) via Mastra's `PgVector`

```typescript
await vectorStore.upsert({
  indexName: 'knowledge_base',
  vectors: embeddings,
  metadata: chunks.map(chunk => ({
    text: chunk.text,
    documentId: doc.id,
    syncTargetId: doc.syncTargetId,
    source: doc.s3Key,
    title: doc.title,
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
