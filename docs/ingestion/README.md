# Ingestion Pipeline

## Overview

Typhoon ingests documents from S3/MinIO, processes them through a multi-stage RAG pipeline, and stores vector embeddings in PostgreSQL (pgvector) for semantic search. The pipeline is orchestrated by BullMQ background jobs running in the worker process.

```mermaid
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    S3["S3 Bucket"] --> Scan["Sync Scan"]
    Scan --> Parse["Parse"]
    Parse --> MDoc["MDocument"]
    MDoc --> Chunk["Chunk"]
    Chunk --> Meta["Metadata Extract"]
    Meta --> Embed["Embed"]
    Embed --> PG["pgvector (upsert)"]
```

## Pipeline Stages

| Stage    | Timeout | Description                                                                      |
| -------- | ------- | -------------------------------------------------------------------------------- |
| Parse    | 60s     | Convert binary/markup formats to text via format-specific parsers                |
| Chunk    | 300s    | Split text into chunks using format-aware strategies with LLM keyword extraction |
| Metadata | 60s     | Generate document title, description, and custom metadata fields via LLM         |
| Embed    | 300s    | Embed chunks via OpenAI-compatible API with adaptive sizing and retry            |
| Upsert   | 30s     | Write embeddings and metadata to pgvector                                        |

Between each stage, the pipeline checks for cancellation via an `isCancelled` callback, allowing sync jobs to be stopped mid-flight from the admin UI.

## Supported Formats

| Format     | Extensions      | Parser                     |
| ---------- | --------------- | -------------------------- |
| PDF        | `.pdf`          | unpdf + spatial analysis   |
| DOCX       | `.docx`         | mammoth + turndown         |
| XLSX       | `.xlsx`         | SheetJS                    |
| HTML       | `.html`, `.htm` | turndown + GFM tables      |
| Markdown   | `.md`, `.mdx`   | Native (no parsing needed) |
| JSON       | `.json`         | Native                     |
| Plain text | `.txt`          | Native                     |

## Key Packages

| Package           | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `@typhoon/ingestion` | Document parsers, MDocument pipeline, BullMQ sync job handlers |
| `@typhoon/queue`     | BullMQ queue definitions and job data types                    |

## Sub-pages

- [Sync Pipeline](./sync-pipeline.md) -- S3 change detection and BullMQ job orchestration
- [Parsers](./parsers.md) -- Format-specific document parsing
- [Chunking](./chunking.md) -- Text splitting strategies
- [Metadata Extraction](./metadata-extraction.md) -- LLM-powered title, description, and custom field extraction
- [Embedding](./embedding.md) -- Adaptive embedding with rate limiting and retry
- [Vector Storage](./vector-storage.md) -- pgvector upsert and update operations
