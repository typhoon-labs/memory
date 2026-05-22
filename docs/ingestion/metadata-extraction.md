# Metadata Extraction

## Overview

LLM-powered metadata extraction runs during ingestion to generate structured metadata for both individual chunks and the document as a whole. This metadata powers filtered search, document browsing, and the knowledge agent's context awareness.

## Per-Chunk Keyword Extraction

During the chunking stage, each chunk is processed by the `LLM_METADATA_EXTRACTION_MODEL` to extract up to 5 keywords. These keywords are stored in the chunk metadata as `excerptKeywords` and propagated into the vector store JSONB for search enhancement.

## Per-Document Metadata Extraction

Document-level metadata is extracted in a single `generateText` + `Output.object` call using a Zod schema built by `buildDocumentMetadataSchema()`. The extraction produces:

- **title** -- a short descriptive title for the document
- **description** -- a single-sentence summary of what the document covers
- **custom metadata fields** -- template-defined fields (when a metadata template is assigned to the sync target)

### Text Sample

The LLM receives the first `METADATA_EXTRACTION_MAX_CHARS` characters of the parsed document text (default: 8000). This provides enough context for accurate extraction without sending the entire document.

### Custom Metadata Fields

When a sync target has a metadata template assigned and `autoExtractMetadata` is enabled:

1. The template's effective schema is resolved (combining field groups and inline fields).
2. Schema defaults are applied to the document's custom metadata.
3. The schema is passed to `generateDocumentMetadata()`, which includes field descriptions and allowed values in the LLM prompt.
4. Extracted values are validated against the schema -- values outside `allowedValues` are discarded.
5. The LLM is instructed to choose the most specific value that matches, avoiding generic or catch-all defaults.

### Combined Extraction

Title, description, and custom metadata fields are extracted in a single LLM call (not separate calls per field). This minimizes latency and API cost. The Zod schema passed to `Output.object` always includes `title` and `description`, plus any custom fields from the metadata template.

## Failure Behavior

Metadata extraction failure is **fatal** -- the document is set to `error` status and the `process-file` job fails. This is intentional: if the LLM cannot extract basic metadata, the document is likely unparseable or the LLM endpoint is down, and retrying at the BullMQ level is appropriate.

## LLM Model

Metadata extraction uses `LLM_METADATA_EXTRACTION_MODEL`, which is typically a fast, cost-efficient model (e.g., Claude Haiku) since the extraction prompts are simple and structured output is used.

## Metadata Propagation

Extracted document metadata is propagated into vector chunk JSONB during the upsert stage. This means every chunk in the vector store carries its parent document's metadata fields, enabling filtered vector search by any metadata dimension.

The propagation flow:

1. `customMetadata` (defaults from schema + existing values) is passed into `processFile()`
2. `generateDocumentMetadata()` extracts additional fields from document content
3. Both are merged: `{ ...customMetadata, ...docMeta.customMetadata }`
4. `buildSearchMetaFields()` groups searchable fields into `_searchMeta_{A,B,C,D}` by weight tier
5. The merged metadata + search meta fields are included in the `vectorStore.upsert()` metadata for every chunk

## Field-Level Search Controls

Metadata field definitions support two optional properties that control full-text search participation:

- **`searchable`** (boolean) — opt-in flag. Only fields with `searchable: true` or an explicit `searchPriority` are included in tsvector indexing.
- **`searchPriority`** — weight tier for tsvector ranking: `critical` (A), `high` (B), `moderate` (C, default), or `standard` (D, same as body text). Fields default to `moderate` when searchable but no priority is set.

These are configured in the admin UI via the field schema editor (Metadata → Field Groups / Templates → expand a field → "Is searchable?" checkbox → Search Weight dropdown).

The `fieldSchema` is always passed to `processFile()` when a metadata template exists, even without `autoExtractMetadata` — search controls work independently of LLM extraction.

When search settings change on a field group or template, affected documents are automatically marked `search_meta_dirty = true` by `MetadataService`. The next sync refreshes their `_searchMeta_*` fields via a lightweight SQL-only path (`metaRefreshOnly`) without re-downloading or re-embedding.

## Environment Variables

| Variable                        | Default | Description                                     |
| ------------------------------- | ------- | ----------------------------------------------- |
| `METADATA_EXTRACTION_MAX_CHARS` | `8000`  | Max characters of document text sent to the LLM |
| `LLM_METADATA_EXTRACTION_MODEL` | --      | Model ID for extraction (typically Haiku-class) |

## Key Files

- `packages/ingestion/src/pipeline.ts` -- `generateDocumentMetadata()`
- `packages/types/src/metadata.ts` -- `buildDocumentMetadataSchema()`, `validateCustomMetadata()`
- `packages/ingestion/src/jobs/process-file.ts` -- template resolution and schema defaults
