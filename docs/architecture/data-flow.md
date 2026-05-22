# Data Flow

This document traces two end-to-end data flows through the Typhoon system: document ingestion (how source files become searchable vector embeddings) and chat queries (how a user question becomes a cited answer).

## Document Ingestion Pipeline

Source documents flow from S3/MinIO through a multi-stage pipeline orchestrated by BullMQ jobs. The pipeline is split into two job types -- a **scan** job that diffs the source against the database and enqueues per-file jobs, and **process-file** jobs that handle the actual ingestion.

```mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
  participant Scheduler as Scheduler (Croner)
  participant Redis as Redis (BullMQ)
  participant Worker as Worker
  participant S3 as S3 / MinIO
  participant DB as PostgreSQL
  participant LLM as LLM (Bifrost)
  participant Embed as Embedding API
  participant PGV as pgvector

  Note over Scheduler: Polls DB every 60s for<br/>sync target schedules

  Scheduler->>DB: Read active sync targets + cron schedules
  Scheduler->>Redis: Enqueue scan job (syncTargetId)

  Note over Worker: Sync worker pool picks up scan job

  Worker->>DB: Load sync target config
  Worker->>S3: listObjects(config, source prefix)
  S3-->>Worker: Source objects (key, etag, size)
  Worker->>DB: Load existing documents for sync target
  Worker->>Worker: computeSyncDiff(sourceObjects, existingDocs)
  Note over Worker: Diff yields: newFiles,<br/>updatedFiles, deletedDocumentIds

  loop For each new/updated file
    Worker->>DB: Create or update document record (status: processing)
    Worker->>Redis: Enqueue process-file job (documentId, sourceKey)
  end

  loop For each deleted document
    Worker->>Redis: Enqueue delete-file job (documentId)
  end

  Note over Worker: Sync worker pool picks up process-file jobs

  Worker->>S3: download(config, sourceKey)
  S3-->>Worker: Raw file content (Buffer)

  Note over Worker: Stage 1: Parse

  Worker->>Worker: getParser(filename) -- DOCX, XLSX, PDF, HTML, or raw text
  Worker->>Worker: parser(content, filename) -> { text, format }

  Note over Worker: Stage 2: Chunk

  Worker->>Worker: MDocument.from{HTML|Markdown|Text}(text)
  Worker->>LLM: mDoc.chunk() with keyword extraction (5 keywords per chunk)
  LLM-->>Worker: Chunked document with metadata

  Note over Worker: Stage 3: Metadata extraction

  Worker->>LLM: generateText() with Output.object(zodSchema)
  Note over LLM: Single call extracts title,<br/>description, and custom<br/>metadata fields from template
  LLM-->>Worker: { title, description, customMetadata }
  Worker->>DB: Update document with title, description, customMetadata

  Note over Worker: Stage 4: Embed

  loop For each chunk (rate-limited, adaptive sizing)
    Worker->>Embed: embed(chunkText)
    Embed-->>Worker: Float32 vector (1536-dim)
  end

  Note over Worker: Stage 5: Upsert

  Worker->>PGV: Upsert vectors with metadata (documentId, syncTargetId, title, section, keywords, customMetadata)
  Worker->>DB: Update document status: synced, set chunkCount
```

### Stage Details

**Scan** (`packages/ingestion/src/jobs/sync-scan.ts`): Triggered by the scheduler or manually from the admin UI. Lists all objects in the S3 prefix, diffs against existing document records to find new, updated (etag changed), and deleted files. Enqueues child jobs with deterministic IDs for deduplication (force-sync uses per-run salt).

**Parse** (`packages/ingestion/src/parsers/`): Format-specific parsers handle DOCX (mammoth), XLSX (SheetJS), PDF (pdf-parse), and HTML (turndown to markdown). Plain text and markdown files skip parsing. The parser registry matches by file extension.

**Chunk** (`packages/ingestion/src/pipeline.ts`): Uses Mastra's `MDocument.chunk()` with format-aware strategies (recursive text splitting for plain text, HTML-aware splitting for HTML). An extraction LLM generates 5 keywords per chunk. Chunks exceeding `EMBEDDING_MAX_CHARS` are split further via `enforceChunkSizeLimit()`.

**Metadata Extraction** (`packages/ingestion/src/pipeline.ts` -> `generateDocumentMetadata()`): A single `generateText` + `Output.object` call using a Zod schema built from `buildDocumentMetadataSchema()`. Extracts document title, description, and any custom metadata fields defined by the sync target's template. Uses up to `METADATA_EXTRACTION_MAX_CHARS` (default 8000) characters of document text. Extraction failure is fatal -- the document enters `error` status.

**Embed** (`packages/ingestion/src/pipeline.ts`): Rate-limited embedding via a module-scope `createRateLimiter` (default: 3 concurrent, 200ms interval). Adaptive chunk sizing uses a `TokenRatioTracker` to proactively split chunks that would exceed the embedding model's token limit. Supports batch embedding via `embedMany` with fallback to per-chunk `embed`.

**Upsert** (`packages/db/src/drivers/pg/`): Vectors are upserted into pgvector with rich JSONB metadata including documentId, syncTargetId, title, section, keywords, source path, and any custom metadata fields from the template. This metadata enables filtered search at query time.

**Per-stage timeouts**: parse (60s), chunk (5m), metadata (60s), embed (5m), upsert (30s). Tighter than BullMQ's lock duration so a hung stage surfaces with a clear label.

---

## Chat Query Flow

A user message flows through the supervisor agent to the knowledge agent's search tools, through reranking and citation generation, and back as a streamed SSE response.

```mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
  participant User as User (Desk / Widget)
  participant FE as Frontend (React)
  participant API as API Server (Hono)
  participant Sup as Supervisor Agent
  participant KS as searchKnowledge Tool
  participant KA as Knowledge Agent
  participant Hybrid as Hybrid Search Tool
  participant Graph as Graph Search Tool
  participant PGV as pgvector
  participant Rerank as Cohere Reranker
  participant Cite as Citation LLM
  participant Mem as Mastra Memory

  User->>FE: Types message
  FE->>API: POST /api/v1/chat (SSE stream via AI SDK useChat)
  API->>Mem: Load last 20 messages for thread
  Mem-->>API: Message history

  API->>Sup: generate(userMessage, { stream: true })
  Note over Sup: Supervisor writes narration:<br/>"Let me look that up for you."

  Sup->>KS: searchKnowledge({ prompt: userMessage })
  Note over KS: Phase 1: Broad Recall

  KS->>KS: Enrich prompt with metadata context (60s TTL cache)
  KS->>KA: generate(enrichedPrompt, { toolChoice: auto, maxSteps: 7 })

  par Parallel tool execution
    KA->>Hybrid: searchKnowledgeBaseHybrid(query, filter)
    Hybrid->>PGV: BM25 keyword search + vector similarity (weighted RRF)
    PGV-->>Hybrid: Candidate chunks (un-reranked)
    Hybrid-->>KA: { sources: [...] }
  and
    KA->>Graph: searchKnowledgeBaseGraph(query, filter)
    Graph->>PGV: Graph-based retrieval (relationship queries)
    PGV-->>Graph: Candidate chunks
    Graph-->>KA: { sources: [...] }
  end

  KA-->>KS: Combined search results from all tool calls

  Note over KS: Merge, dedup by chunkId,<br/>keep highest score per chunk

  KS->>Rerank: refineResults(candidates, query)
  Note over Rerank: Cross-encoder reranking<br/>filter by RAG_RERANK_MIN_SCORE<br/>cap at RAG_KNOWLEDGE_MAX_RESULTS
  Rerank-->>KS: Reranked + filtered chunks

  Note over KS: Phase 2: Precision Citation

  KS->>KS: Group chunks by document, assign hierarchical indices [N] or [N.M]
  KS->>Cite: generateText(system: CITATION_SYSTEM, prompt + searchResults)
  Note over Cite: Structured output:<br/>{ answer, citedRefs }
  Cite-->>KS: Cited answer with [Source: N] markers

  KS->>KS: Reindex citations to sequential numbering
  KS->>KS: Resolve graph tool fake IDs to real vector store chunk IDs
  KS-->>Sup: { text, _chunkSources }

  Sup-->>API: Streamed response with tool results
  API-->>FE: SSE stream (AI SDK UIMessageStream)
  FE-->>User: Rendered answer with clickable source citations

  opt Scoring enabled (sampled)
    API->>Redis: Enqueue score-message job
    Note over Redis: Reviews worker scores<br/>response quality + retrieval quality
  end
```

### Query Flow Details

**Frontend** (`apps/desk/src/components/pages/chat.tsx`, `apps/widget/src/main.tsx`): Uses AI SDK v6 `DefaultChatTransport` + `useChat` hook. The `useStreamStallDetection` hook monitors for server hangs and auto-aborts after 15s of inactivity.

**API Layer** (`apps/api/src/routes/chat.ts`): Receives the chat request, loads thread context via Mastra Memory (last 20 messages), and calls the supervisor agent with streaming enabled. The response is returned as an SSE stream via `createUIMessageStreamResponse()`.

**Supervisor Agent** (`packages/agents/src/supervisor.ts`): Routes the query by calling `searchKnowledge` with the user's full message verbatim. Also calls `setThreadTitle` on the first message of a new conversation. Never splits multi-topic questions. Temperature is set to 0 for deterministic routing.

**searchKnowledge Composite Tool** (`packages/agents/src/tools/knowledge-search.ts`): Two-phase design:

1. **Broad Recall** -- Calls the knowledge agent, which dispatches to hybrid and/or graph search tools. Sub-tools return un-reranked candidates (`rerank: false`) to avoid double-reranking. The composite tool merges all results, deduplicates by chunk ID (keeping the highest score), and reranks the combined set using a Cohere cross-encoder via `refineResults()`.
2. **Precision Citation** -- Groups reranked chunks by document, assigns hierarchical display indices (`[N]` for single-chunk docs, `[N.M]` for multi-chunk), and calls a dedicated citation LLM with structured output to generate an answer with `[Source: N]` markers. Citation indices are rewritten to sequential numbering based on actually-cited references.

**Knowledge Agent** (`packages/agents/src/knowledge.ts`): Has `toolChoice: 'required'` to ensure it always searches before responding. Default behavior is to call both hybrid and graph tools in parallel for best coverage. Understands metadata filter syntax and applies filters based on conversation context and available metadata fields.

**Metadata Context Injection** (`apps/api/src/mastra/index.ts`): A `getMetadataContext()` callback queries the database for available metadata field names and values, cached with a 60-second TTL. This context is prepended to the user's prompt so the knowledge agent knows which filter fields exist and what values are valid.

**Tool Progress** (`packages/agents/src/tools/with-progress.ts`): `emitToolProgress()` writes transient `data-tool-progress` chunks into the SSE stream. The chat UI renders these as status updates under the tool call pill (e.g., "Searching the knowledge base...", "Reranking 24 combined chunks...", "Composing answer with citations...").

**Scoring** (optional): When scoring is enabled, the API enqueues a `score-message` job after each chat response. The reviews worker runs built-in scorers (Answer Relevancy, Faithfulness, Hallucination, Context Relevance, Context Precision) via BullMQ Flow fan-out.

### Key Configuration

| Parameter                          | Default                  | Description                               |
| ---------------------------------- | ------------------------ | ----------------------------------------- |
| `RAG_RERANK_MIN_SCORE`             | Configured in `@typhoon/ai` | Minimum reranker score threshold          |
| `RAG_KNOWLEDGE_MAX_RESULTS`        | Configured in `@typhoon/ai` | Max chunks after reranking                |
| `RAG_RERANK_WEIGHTS`               | Configured in `@typhoon/ai` | Cross-encoder weight configuration        |
| `METADATA_EXTRACTION_MAX_CHARS`    | 8000                     | Max document text for metadata extraction |
| `EMBEDDING_RATE_LIMIT_CONCURRENT`  | 3                        | Max concurrent embedding API calls        |
| `EMBEDDING_RATE_LIMIT_INTERVAL_MS` | 200                      | Min interval between embedding calls      |
| `EMBEDDING_BATCH_SIZE`             | 1                        | Texts per `embedMany` call                |
| Memory `lastMessages`              | 20                       | Messages loaded per thread for context    |

### Related Documentation

- [Agent Architecture](./agent-architecture.md) -- detailed agent, tool, and guardrail documentation
- [Layered Architecture](./layered-architecture.md) -- how routes, services, and repos are structured
- [Package Dependency Model](./package-dependency-model.md) -- package relationships and build order
