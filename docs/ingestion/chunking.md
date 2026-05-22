# Chunking Strategies

## Overview

After parsing, documents are split into chunks using Mastra's `MDocument.chunk()` with format-aware strategies. All strategies include `addStartIndex: true` so each chunk records its byte offset in the source text for citation linking.

## Strategy Table

| Format     | Strategy            | Max Size              | Overlap  | Description                                                            |
| ---------- | ------------------- | --------------------- | -------- | ---------------------------------------------------------------------- |
| Markdown   | `semantic-markdown` | `EMBEDDING_MAX_CHARS` | 50 chars | Semantic boundary splitting with 500-char join threshold               |
| HTML       | `html`              | `EMBEDDING_MAX_CHARS` | 200      | Respects heading hierarchy (h1 = title, h2 = section, h3 = subsection) |
| JSON       | `token`             | 512 tokens            | 50       | Token-based splitting                                                  |
| All others | `sentence`          | 512 tokens            | 50       | Sentence-boundary splitting                                            |

## Strategy Details

### Markdown (`semantic-markdown`)

The semantic-markdown strategy splits on semantic boundaries in the markdown structure (headings, horizontal rules, code fences). Short adjacent sections are joined up to a 500-char join threshold to avoid producing many tiny chunks. Note: `semantic-markdown` **ignores `maxSize`** for within-section content -- a long section with no sub-headers will be emitted as a single oversized chunk, which `enforceChunkSizeLimit` then splits.

Overlap of 50 chars ensures context continuity between adjacent chunks (applied by `enforceChunkSizeLimit` when splitting oversized sections, and by Mastra when merging small sections).

### HTML (`html`)

The HTML strategy splits on heading elements, creating a hierarchical structure:

- `h1` tags define the document title
- `h2` tags define sections
- `h3` tags define subsections

Each chunk's metadata includes a `section` field with the heading text, which is propagated into the vector store for search filtering.

### JSON (`token`)

Token-based splitting with a 512-token maximum and 50-token overlap. This is a simple strategy that does not attempt to preserve JSON structure boundaries -- it splits purely by token count.

### Sentence (`sentence`)

The default strategy for plain text and any other format. Splits on sentence boundaries (periods followed by whitespace) with a 512-token maximum and 50-token overlap.

## Keyword Extraction

All chunking strategies include LLM-powered keyword extraction. During chunking, up to 5 keywords are extracted per chunk using the `LLM_METADATA_EXTRACTION_MODEL`. These keywords are stored in the chunk metadata as `excerptKeywords` and propagated into the vector store for search enhancement.

## Safety Net: `enforceChunkSizeLimit`

After chunking, a safety net function splits any chunk exceeding `EMBEDDING_MAX_CHARS` on increasingly aggressive boundaries:

1. **Paragraph boundaries** (`\n\n`) -- preferred split point
2. **Sentence boundaries** (`.` followed by whitespace) -- fallback
3. **Hard character split** -- last resort, splits at exact character count

Each sub-chunk preserves the parent chunk's metadata.

### Overlap

`enforceChunkSizeLimit` accepts an `overlap` parameter (sourced from `buildChunkOptions()` -- 50 chars for markdown, 200 for HTML). When splitting at paragraph or sentence boundaries, trailing content from the previous chunk is carried into the start of the next chunk:

- **Whole-part overlap** -- if a trailing paragraph or sentence fits within the overlap budget, it is carried over intact
- **Character fallback** -- if all parts exceed the budget (e.g. long sentences with a 50-char budget), the last `overlap` characters of the final part are used instead
- **Hard character splits** get no overlap, since the boundaries are arbitrary

This ensures context continuity at chunk boundaries, particularly for long prose sections without sub-headers where Mastra's `semantic-markdown` strategy produces oversized chunks (it ignores `maxSize` for within-section content).

## Empty Chunk Filtering

After chunking and the safety net pass, chunks that are empty or contain only whitespace are filtered out before embedding.

## Key Files

- `packages/ingestion/src/pipeline.ts` -- `buildChunkOptions()`, `enforceChunkSizeLimit()`
