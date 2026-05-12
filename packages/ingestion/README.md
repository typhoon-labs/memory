# @typhoon/ingestion

Document ingestion pipeline. Handles file parsing, chunking, embedding, and vector storage with async job processing via BullMQ.

## Pipeline

```
S3 Object → Download → Parse → Chunk → Generate Metadata → Embed → Upsert Vectors
```

Supported formats: PDF, DOCX, Markdown, HTML, CSV, Excel, JSON, plain text.

## Exports

**Pipeline:**

| Export | Description |
|--------|-------------|
| `processFile()` | Full ingestion pipeline for a single file |
| `deleteDocumentVectors()` | Remove vectors for a document |
| `updateDocumentVectorSource()` | Update vector metadata when source changes |
| `updateDocumentVectorMetadata()` | Merge custom metadata into chunk JSONB |
| `updateDocumentVectorTitle()` | Update title in chunk metadata |
| `extractMetadataFromContent()` | LLM-based metadata extraction from document text (handles markdown-fenced responses, validates against allowedValues) |
| `buildChunkOptions()` | Format-specific chunking configuration |

**Job Handlers:**

| Export | Description |
|--------|-------------|
| `handleProcessFileJob()` | BullMQ handler for file processing |
| `handleScanJob()` | BullMQ handler for sync scanning (diff detection) |
| `handleDeleteFileJob()` | BullMQ handler for file deletion |
| `createReportsQueue()` / `createSyncQueue()` | Queue factory functions |

**Parsers & Providers:**

| Export | Description |
|--------|-------------|
| `getParser()` | Get format-specific parser (PDF, DOCX, etc.) |
| `getMDocFormat()` | Map MIME type to MDocument format |
| `needsCustomParser()` | Check if a MIME type needs a custom parser |
| `getProvider()` | Get storage provider (S3) |

**Registries:**

| Export | Description |
|--------|-------------|
| `registerSource()` / `getSource()` / `listSources()` | S3 credential registry |
| `registerSyncTarget()` / `listRegisteredSyncTargets()` | Sync target registry |
| `computeSyncDiff()` | Compute new/updated/deleted files between syncs |

## Structure

```
src/
  pipeline.ts           — Core ingestion pipeline (parse → chunk → embed → upsert)
  sync.ts               — Sync diff computation
  source-registry.ts    — S3 credential management
  sync-target-registry.ts — Sync target definitions
  jobs/
    process-file.ts     — File processing job handler
    sync-scan.ts        — Sync scan job handler
    delete-file.ts      — File deletion job handler
    queues.ts           — BullMQ queue factories
  parsers/
    pdf.ts              — Custom PDF parser (font-aware HTML generation)
    registry.ts         — Parser/format resolution
  providers/
    s3.ts               — S3/MinIO provider
  util/
    classify-error.ts   — Error classification (recoverable vs unrecoverable)
    with-timeout.ts     — Per-stage timeout wrapper
```

## Dependencies

`@typhoon/ai`, `@typhoon/db`, `@typhoon/logger`, `@typhoon/storage`, `@typhoon/types`, `@mastra/rag`, `bullmq`, `unpdf`, `mammoth`, `turndown`, `xlsx`
