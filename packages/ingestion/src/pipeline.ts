import { createHash } from 'node:crypto';

import { MDocument } from '@mastra/rag';
import {
  createEmbeddingModel,
  createMetadataExtractionModel,
  EMBEDDING_MAX_CHARS,
  EMBEDDING_MAX_TOKENS,
  METADATA_EXTRACTION_MAX_CHARS,
} from '@typhoon/ai';
import type { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import { chunkSizeChars, embedRetryCount, embedTokenUsage, getTracer, SpanStatusCode } from '@typhoon/telemetry';
import type { SearchPriority } from '@typhoon/types';
import { SEARCH_PRIORITY_TO_WEIGHT } from '@typhoon/types';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { embed, embedMany, generateText, Output } from 'ai';

import { getMDocFormat, getParser, needsCustomParser } from './parsers/registry';
import { createRateLimiter } from './util/rate-limiter';
import { recordStageDuration } from './util/stage-metrics';
import { withTimeout } from './util/with-timeout';

const tracer = getTracer('ingestion');

const log = createAppLogger('pipeline');

/** Re-export from @typhoon/ai for test access. */
export { EMBEDDING_MAX_CHARS };

// Module-scope rate limiter shared across all concurrent workers in this
// process. Limits concurrent embedding API calls and enforces a minimum
// interval between requests to avoid overwhelming the provider.
const embeddingLimiter = createRateLimiter({
  maxConcurrent: Number(process.env.EMBEDDING_RATE_LIMIT_CONCURRENT ?? '3'),
  minIntervalMs: Number(process.env.EMBEDDING_RATE_LIMIT_INTERVAL_MS ?? '200'),
});

// Per-stage timeouts for processFile. These are deliberately tighter than the
// BullMQ default lockDuration so a hung external call surfaces with a stage
// label long before BullMQ would consider the job stalled. Defaults are sized
// to current pipeline behaviour:
//   - chunk/embed get 5 minutes because mDoc.chunk runs the LLM per chunk
//     for keyword extraction (see buildChunkOptions) and embedMany batches
//     across all chunks of a document
//   - parse/metadata are single calls and should never need more than 60s
//   - upsert is a single pgvector write
const STAGE_TIMEOUTS = {
  parse: 60_000,
  chunk: 300_000,
  metadata: 60_000,
  embed: 300_000,
  upsert: 30_000,
} as const;

/** Max texts per embedMany call. Set to 1 to skip batching and embed individually. */
const EMBED_BATCH_SIZE = Number(process.env.EMBEDDING_BATCH_SIZE ?? '1');

export interface ProcessFileInput {
  content: Buffer;
  filename: string;
  documentId: string;
  syncTargetId: string;
  sourceKey: string;
  title?: string;
  /**
   * Optional callback invoked at the start of each pipeline stage. Job
   * handlers wire this to BullMQ `job.updateProgress` so the admin UI can
   * show a live "current stage" via the existing SSE pipeline. The pipeline
   * itself just announces — persistence is the caller's concern.
   */
  onStage?: (stage: string) => Promise<void> | void;
  /**
   * Optional callback checked before each expensive stage (chunk, metadata,
   * embed, upsert). If it returns `true`, the pipeline bails out early.
   * Used by job handlers to support sync cancellation.
   */
  isCancelled?: () => Promise<boolean>;
  /** User-defined metadata to include in vector chunk JSONB (propagated from document). */
  customMetadata?: Record<string, unknown>;
  /** Metadata schema for structured extraction (custom fields). When provided, the metadata LLM call extracts these fields alongside title/description. */
  metadataSchema?: Record<
    string,
    { type: 'string' | 'number' | 'boolean' | 'string[]'; allowedValues?: unknown[]; description?: string }
  >;
  /** Field-level search controls (searchable, searchPriority). Always passed when a metadata template exists, even without autoExtractMetadata. Powers `buildSearchMetaFields()` for weighted tsvector. */
  fieldSchema?: Record<string, { searchable?: boolean; searchPriority?: SearchPriority }>;
}

export interface ProcessFileResult {
  chunkCount: number;
  title: string | null;
  description: string | null;
  customMetadata: Record<string, unknown>;
}

export async function processFile(input: ProcessFileInput, vectorStore: PgVector): Promise<ProcessFileResult> {
  const {
    content,
    filename,
    documentId,
    syncTargetId,
    sourceKey,
    title,
    onStage,
    isCancelled,
    customMetadata,
    metadataSchema,
    fieldSchema,
  } = input;
  const tStart = Date.now();
  const announce = async (stage: string) => {
    if (onStage) await onStage(stage);
  };
  const checkCancelled = async () => {
    if (isCancelled && (await isCancelled())) {
      log.info('Pipeline cancelled', { filename, documentId });
      return true;
    }
    return false;
  };

  return tracer.startActiveSpan(
    'processFile',
    { attributes: { 'document.id': documentId, 'document.filename': filename } },
    async (rootSpan) => {
      try {
        // 1. Parse if needed, or use raw text
        let text = '';
        let format: 'text' | 'html' | 'markdown' | 'json' = 'text';
        let parseMs = 0;

        if (needsCustomParser(filename)) {
          const parser = getParser(filename);
          if (!parser) throw new Error(`No parser for ${filename}`);
          await announce('parse');
          await tracer.startActiveSpan('parse', async (parseSpan) => {
            const t0 = Date.now();
            const result = await withTimeout(parser(content, filename), STAGE_TIMEOUTS.parse, 'parse');
            text = result.text;
            format = result.format;
            parseMs = Date.now() - t0;
            recordStageDuration('parse', parseMs);
            parseSpan.setAttributes({ 'parse.chars': text.length, 'parse.format': format, 'parse.ms': parseMs });
            parseSpan.end();
            log.info('Parsed document', { filename, ms: parseMs, chars: text.length });
          });
        } else {
          text = content.toString('utf-8');
          format = getMDocFormat(filename);
        }

        rootSpan.setAttribute('document.format', format);
        rootSpan.setAttribute('document.chars', text.length);

        if (!text.trim()) {
          log.info('Empty content, skipping', { filename });
          rootSpan.setStatus({ code: SpanStatusCode.OK });
          return { chunkCount: 0, title: null, description: null, customMetadata: customMetadata ?? {} };
        }

        // 2. Create MDocument based on format
        let mDoc: MDocument;
        switch (format) {
          case 'html':
            mDoc = MDocument.fromHTML(text);
            break;
          case 'markdown':
            mDoc = MDocument.fromMarkdown(text);
            break;
          case 'json':
            mDoc = MDocument.fromJSON(text);
            break;
          default:
            mDoc = MDocument.fromText(text);
        }

        // 3. Chunk using Mastra's built-in strategy with metadata extraction
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra extract types expect MastraLanguageModel but AI SDK LanguageModelV3 works at runtime
        const extractionLlm = createMetadataExtractionModel() as any;
        const extract = {
          keywords: { llm: extractionLlm, keywords: 5 },
        };

        const chunkOptions = buildChunkOptions(format, extract);

        if (await checkCancelled())
          return { chunkCount: 0, title: null, description: null, customMetadata: customMetadata ?? {} };

        await announce('chunk');
        let chunkMs = 0;
        let minChunkChars = 0;
        let maxChunkChars = 0;
        let avgChunkChars = 0;
        const chunks = await tracer.startActiveSpan('chunk', async (chunkSpan) => {
          const tChunk = Date.now();
          const rawChunks = await withTimeout(mDoc.chunk(chunkOptions), STAGE_TIMEOUTS.chunk, 'chunk');
          const result = enforceChunkSizeLimit(rawChunks, EMBEDDING_MAX_CHARS, chunkOptions.overlap ?? 0).filter((c) =>
            c.text.trim(),
          );
          chunkMs = Date.now() - tChunk;
          recordStageDuration('chunk', chunkMs);

          const chunkChars = result.map((c) => c.text.length);
          minChunkChars = chunkChars.length ? Math.min(...chunkChars) : 0;
          maxChunkChars = chunkChars.length ? Math.max(...chunkChars) : 0;
          avgChunkChars = chunkChars.length ? Math.round(chunkChars.reduce((a, b) => a + b, 0) / chunkChars.length) : 0;
          for (const size of chunkChars) chunkSizeChars.record(size);

          chunkSpan.setAttributes({
            'chunk.count': result.length,
            'chunk.format': format,
            'chunk.min_chars': minChunkChars,
            'chunk.max_chars': maxChunkChars,
            'chunk.avg_chars': avgChunkChars,
          });
          chunkSpan.end();

          log.info('Chunked document', { filename, chunks: result.length, format, ms: chunkMs });
          for (let ci = 0; ci < result.length; ci++) {
            log.debug('Chunk detail', {
              index: ci,
              chars: result[ci].text.length,
              preview: result[ci].text.slice(0, 80),
            });
          }
          return result;
        });

        if (chunks.length === 0) {
          rootSpan.setStatus({ code: SpanStatusCode.OK });
          return { chunkCount: 0, title: null, description: null, customMetadata: customMetadata ?? {} };
        }

        // 4. Generate document-level title, description, and custom metadata
        await announce('metadata');
        let metaMs = 0;
        const docMeta = await tracer.startActiveSpan('metadata', async (metaSpan) => {
          const tMeta = Date.now();
          const result = await withTimeout(
            generateDocumentMetadata(text, extractionLlm, metadataSchema),
            STAGE_TIMEOUTS.metadata,
            'metadata',
          );
          metaMs = Date.now() - tMeta;
          recordStageDuration('metadata', metaMs);
          metaSpan.setAttribute('metadata.title', result.title);
          metaSpan.end();
          log.info('Generated document metadata', {
            filename,
            title: result.title,
            customFields: Object.keys(result.customMetadata),
            ms: metaMs,
          });
          return result;
        });

        if (await checkCancelled())
          return { chunkCount: 0, title: null, description: null, customMetadata: customMetadata ?? {} };

        // 5. Embed using AI SDK (rate-limited, adaptive chunk sizing)
        await announce('embed');
        const embedded: EmbeddedChunk[] = [];
        const ratioTracker = new TokenRatioTracker();
        let retryCount = 0;
        let totalTokens = 0;
        let proactiveSplits = 0;
        let embedMs = 0;

        await tracer.startActiveSpan('embed', async (embedSpan) => {
          const tEmbed = Date.now();
          const embeddingModel = createEmbeddingModel();

          const onTokens = (chars: number, tokens: number) => {
            ratioTracker.record(chars, tokens);
            totalTokens += tokens;
            embedTokenUsage.record(tokens);
          };

          // Embed chunks with interleaved adaptive splitting — each chunk's split
          // decision uses the latest ratio from previous successful embeds.
          const pendingBatch: Array<{ text: string; metadata: Record<string, unknown> }> = [];

          const flushBatch = async () => {
            if (pendingBatch.length === 0) return;
            const batch = pendingBatch.splice(0);
            await embeddingLimiter.acquire();
            try {
              if (EMBED_BATCH_SIZE > 1 && batch.length > 1) {
                try {
                  const result = await withTimeout(
                    embedMany({ model: embeddingModel as unknown as EmbeddingModel, values: batch.map((c) => c.text) }),
                    STAGE_TIMEOUTS.embed,
                    'embed',
                  );
                  if (result.embeddings.length === batch.length) {
                    for (let j = 0; j < batch.length; j++) {
                      embedded.push({ ...batch[j], embedding: result.embeddings[j] });
                    }
                    const usage = (result as unknown as { usage?: { tokens?: number } }).usage;
                    if (usage?.tokens)
                      onTokens(
                        batch.reduce((a, c) => a + c.text.length, 0),
                        usage.tokens,
                      );
                    return;
                  }
                  log.warn('embedMany returned wrong count, falling back to per-chunk', {
                    expected: batch.length,
                    got: result.embeddings.length,
                  });
                } catch (batchError) {
                  log.warn('Batch embed failed, falling back to per-chunk', {
                    batchSize: batch.length,
                    error: batchError instanceof Error ? batchError.message : String(batchError),
                  });
                }
              }
              // Per-chunk embed (default when EMBED_BATCH_SIZE=1, or batch fallback)
              for (const item of batch) {
                // oxlint-disable-next-line no-await-in-loop -- sequential: rate-limited embedding with retry
                const result = await embedChunkWithRetry(item, embeddingModel, 0, 3, onTokens);
                retryCount += result.retries;
                embedded.push(...result.results);
              }
            } finally {
              embeddingLimiter.release();
            }
          };

          for (const chunk of chunks) {
            const adaptiveMax = Math.min(EMBEDDING_MAX_CHARS, ratioTracker.safeMaxChars(EMBEDDING_MAX_TOKENS));

            if (chunk.text.length > adaptiveMax) {
              proactiveSplits++;
              log.info('Proactively splitting chunk based on measured ratio', {
                chunkChars: chunk.text.length,
                adaptiveMax,
                ratio: ratioTracker.ratio,
              });
              const subTexts = splitOversizedText(chunk.text, adaptiveMax);
              for (const sub of subTexts) pendingBatch.push({ text: sub, metadata: { ...chunk.metadata } });
            } else {
              pendingBatch.push(chunk);
            }

            if (pendingBatch.length >= EMBED_BATCH_SIZE) {
              // oxlint-disable-next-line no-await-in-loop -- sequential: flush batches as they fill up
              await flushBatch();
            }
          }
          await flushBatch();

          embedMs = Date.now() - tEmbed;
          recordStageDuration('embed', embedMs);

          // Validate no undefined embeddings before upsert
          const badIdx = embedded.findIndex((e) => !Array.isArray(e.embedding));
          if (badIdx >= 0) {
            throw new Error(
              `Embedding at index ${badIdx} is missing or invalid (chars: ${embedded[badIdx].text.length})`,
            );
          }

          embedSpan.setAttributes({
            'embed.count': embedded.length,
            'embed.retries': retryCount,
            'embed.proactive_splits': proactiveSplits,
            'embed.total_tokens': totalTokens,
            'embed.chars_per_token': ratioTracker.ratio ?? 0,
          });
          embedSpan.end();
          log.info('Embedded chunks', { filename, embeddings: embedded.length, ms: embedMs });
        });

        // 6. Compute startIndex for embedded chunks
        const startIndices: (number | null)[] = [];
        let searchFrom = 0;
        for (const entry of embedded) {
          const existing = (entry.metadata as Record<string, unknown>)?.startIndex;
          if (typeof existing === 'number') {
            startIndices.push(existing);
            searchFrom = existing + entry.text.length;
          } else {
            const idx = text.indexOf(entry.text.slice(0, 80), searchFrom);
            startIndices.push(idx >= 0 ? idx : null);
            if (idx >= 0) searchFrom = idx + entry.text.length;
          }
        }

        if (await checkCancelled())
          return { chunkCount: 0, title: null, description: null, customMetadata: customMetadata ?? {} };

        // 7. Upsert to PgVector with extracted metadata + search meta fields
        const docTitle = title ?? docMeta.title;
        const mergedMetadata = { ...customMetadata, ...docMeta.customMetadata };
        const searchMetaFields = buildSearchMetaFields(mergedMetadata, fieldSchema);
        await announce('upsert');
        let upsertMs = 0;
        await tracer.startActiveSpan('upsert', async (upsertSpan) => {
          const tUpsert = Date.now();
          const chunkIds = embedded.map((entry, i) => makeChunkId(documentId, startIndices[i], entry.text));

          await withTimeout(
            vectorStore.upsert({
              indexName: 'knowledge_base',
              ids: chunkIds,
              vectors: embedded.map((e) => e.embedding),
              metadata: embedded.map((entry, i) => ({
                text: entry.text,
                documentId,
                syncTargetId,
                source: sourceKey,
                title: docTitle,
                section: (entry.metadata as Record<string, unknown>)?.section ?? '',
                keywords: (entry.metadata as Record<string, unknown>)?.excerptKeywords ?? '',
                startIndex: startIndices[i],
                ...mergedMetadata,
                ...searchMetaFields,
              })),
            }),
            STAGE_TIMEOUTS.upsert,
            'upsert',
          );

          upsertMs = Date.now() - tUpsert;
          recordStageDuration('upsert', upsertMs);
          upsertSpan.setAttribute('upsert.count', embedded.length);
          upsertSpan.end();
        });

        // Summary span attributes
        rootSpan.setAttributes({
          'pipeline.chunk_count': embedded.length,
          'pipeline.min_chunk_chars': minChunkChars,
          'pipeline.max_chunk_chars': maxChunkChars,
          'pipeline.avg_chunk_chars': avgChunkChars,
          'pipeline.embed_retries': retryCount,
          'pipeline.embed_proactive_splits': proactiveSplits,
          'pipeline.total_tokens': totalTokens,
          'pipeline.chars_per_token': ratioTracker.ratio ?? 0,
        });
        rootSpan.setStatus({ code: SpanStatusCode.OK });

        // Per-document summary log
        log.info('Pipeline complete', {
          documentId,
          filename,
          format,
          totalChars: text.length,
          chunkCount: embedded.length,
          minChunkChars,
          maxChunkChars,
          avgChunkChars,
          retries: retryCount,
          proactiveSplits,
          totalTokens,
          charsPerToken: ratioTracker.ratio,
          parseMs,
          chunkMs,
          metaMs,
          embedMs,
          upsertMs,
          totalMs: Date.now() - tStart,
        });

        return {
          chunkCount: embedded.length,
          title: docTitle,
          description: docMeta.description || null,
          customMetadata: mergedMetadata,
        };
      } catch (error) {
        rootSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) rootSpan.recordException(error);
        throw error;
      } finally {
        rootSpan.end();
      }
    },
  );
}

/**
 * Split any chunk exceeding the embedding model's input limit.
 * Splits on paragraph boundaries, then sentence boundaries, then hard character split.
 * When `overlap` > 0, trailing content from each chunk is carried into the next:
 * whole parts (paragraphs/sentences) if they fit the budget, otherwise the last
 * `overlap` characters of the final part. Hard character splits get no overlap.
 * Preserves metadata from the parent chunk on each sub-chunk.
 */
export function enforceChunkSizeLimit(
  chunks: Array<{ text: string; metadata: Record<string, unknown> }>,
  maxChars: number,
  overlap = 0,
): Array<{ text: string; metadata: Record<string, unknown> }> {
  const result: Array<{ text: string; metadata: Record<string, unknown> }> = [];

  for (const chunk of chunks) {
    if (chunk.text.length <= maxChars) {
      result.push(chunk);
      continue;
    }

    log.warn('Chunk exceeds embedding limit, splitting', {
      originalLength: chunk.text.length,
      maxChars,
    });

    const subTexts = splitOversizedText(chunk.text, maxChars, overlap);
    for (const sub of subTexts) {
      result.push({ text: sub, metadata: { ...chunk.metadata } });
    }
  }

  return result;
}

function splitOversizedText(text: string, maxChars: number, overlap = 0): string[] {
  // Try paragraph boundaries first
  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length > 1) {
    return reassemble(paragraphs, maxChars, '\n\n', overlap);
  }

  // Fall back to sentence boundaries
  const sentences = text.split(/(?<=\.)\s+/);
  if (sentences.length > 1) {
    return reassemble(sentences, maxChars, ' ', overlap);
  }

  // Last resort: hard character split (no overlap — boundaries are arbitrary)
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    pieces.push(text.slice(i, i + maxChars));
  }
  return pieces;
}

/**
 * Walk backwards through `parts` and return trailing parts that fit within `budget` chars (joined).
 * If no whole part fits, fall back to the last `budget` characters of the final part.
 */
function overlapParts(parts: string[], joiner: string, budget: number): string[] {
  if (parts.length === 0 || budget <= 0) return [];
  const selected: string[] = [];
  let size = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const sep = selected.length > 0 ? joiner.length : 0;
    if (size + parts[i].length + sep > budget) break;
    selected.unshift(parts[i]);
    size += parts[i].length + sep;
  }
  // If no whole part fits, take the trailing characters of the last part
  if (selected.length === 0) {
    const last = parts[parts.length - 1];
    selected.push(last.slice(-budget));
  }
  return selected;
}

function reassemble(parts: string[], maxChars: number, joiner: string, overlap = 0): string[] {
  const result: string[] = [];
  let currentParts: string[] = [];
  let currentLen = 0;

  for (const part of parts) {
    const sep = currentParts.length > 0 ? joiner.length : 0;
    const candidateLen = currentLen + sep + part.length;

    if (candidateLen <= maxChars) {
      currentParts.push(part);
      currentLen = candidateLen;
    } else {
      if (currentParts.length > 0) {
        result.push(currentParts.join(joiner));
      }
      if (part.length > maxChars) {
        result.push(...splitOversizedText(part, maxChars, overlap));
        currentParts = [];
        currentLen = 0;
      } else {
        const seed = overlap > 0 ? overlapParts(currentParts, joiner, overlap) : [];
        currentParts = [...seed, part];
        currentLen = currentParts.join(joiner).length;
      }
    }
  }
  if (currentParts.length > 0) result.push(currentParts.join(joiner));
  return result;
}

interface EmbeddedChunk {
  text: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

/**
 * Tracks the observed chars-per-token ratio from successful embeds.
 * Used to proactively split oversized chunks before sending them to the API.
 */
export class TokenRatioTracker {
  private totalChars = 0;
  private totalTokens = 0;

  /** Record a successful embedding's character count and token count. */
  record(chars: number, tokens: number) {
    this.totalChars += chars;
    this.totalTokens += tokens;
  }

  /** Returns the max safe chars for the given token limit, or Infinity if no data yet. */
  safeMaxChars(maxTokens: number, margin = 0.9): number {
    if (this.totalTokens === 0) return Number.POSITIVE_INFINITY;
    const ratio = this.totalChars / this.totalTokens;
    return Math.floor(maxTokens * ratio * margin);
  }

  get hasData() {
    return this.totalTokens > 0;
  }

  get ratio() {
    return this.totalTokens > 0 ? this.totalChars / this.totalTokens : null;
  }
}

interface EmbedRetryResult {
  results: EmbeddedChunk[];
  retries: number;
}

/**
 * Embed a single chunk. On any error, split the text in half and retry
 * recursively (up to `maxDepth` levels). Non-size errors will fail at all
 * split levels and eventually throw.
 */
async function embedChunkWithRetry(
  chunk: { text: string; metadata: Record<string, unknown> },
  model: ReturnType<typeof createEmbeddingModel>,
  depth = 0,
  maxDepth = 3,
  onTokens?: (chars: number, tokens: number) => void,
): Promise<EmbedRetryResult> {
  return tracer.startActiveSpan(
    'embed_chunk',
    { attributes: { 'chunk.chars': chunk.text.length, 'chunk.depth': depth } },
    async (span) => {
      try {
        const response = (await embed({ model: model as unknown as EmbeddingModel, value: chunk.text })) as unknown as {
          embedding: number[];
          usage?: { tokens?: number };
        };
        if (response.usage?.tokens) {
          onTokens?.(chunk.text.length, response.usage.tokens);
          span.setAttribute('chunk.tokens', response.usage.tokens);
        }
        log.debug('Embedded chunk', { chars: chunk.text.length, depth });
        span.end();
        return {
          results: [{ text: chunk.text, metadata: chunk.metadata, embedding: response.embedding }],
          retries: 0,
        };
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) span.recordException(error);
        span.end();

        if (depth >= maxDepth) throw error;
        embedRetryCount.add(1);
        log.warn('Embed failed, splitting and retrying', {
          chars: chunk.text.length,
          depth,
          error: error instanceof Error ? error.message : String(error),
        });
        const halvedMax = Math.ceil(chunk.text.length / 2);
        const subTexts = splitOversizedText(chunk.text, halvedMax);
        log.debug('Split chunk for retry', {
          originalChars: chunk.text.length,
          subChunks: subTexts.length,
          halvedMax,
        });
        const allResults: EmbeddedChunk[] = [];
        let totalRetries = 1;
        for (const sub of subTexts) {
          // oxlint-disable-next-line no-await-in-loop -- sequential: recursive retry embedding of sub-chunks
          const inner = await embedChunkWithRetry(
            { text: sub, metadata: { ...chunk.metadata } },
            model,
            depth + 1,
            maxDepth,
            onTokens,
          );
          allResults.push(...inner.results);
          totalRetries += inner.retries;
        }
        return { results: allResults, retries: totalRetries };
      }
    },
  );
}

export function buildChunkOptions(format: string, extract: Record<string, unknown>) {
  switch (format) {
    case 'markdown':
      return {
        strategy: 'semantic-markdown' as const,
        joinThreshold: 500,
        maxSize: EMBEDDING_MAX_CHARS,
        overlap: 50,
        addStartIndex: true,
        extract,
      };
    case 'html':
      return {
        strategy: 'html' as const,
        headers: [
          ['h1', 'title'],
          ['h2', 'section'],
          ['h3', 'subsection'],
        ] as [string, string][],
        maxSize: EMBEDDING_MAX_CHARS,
        overlap: 200,
        addStartIndex: true,
        extract,
      };
    case 'json':
      return { strategy: 'token' as const, maxSize: 512, overlap: 50, addStartIndex: true, extract };
    default:
      return { strategy: 'sentence' as const, maxSize: 512, overlap: 50, addStartIndex: true, extract };
  }
}

/**
 * Generate document title, description, and optional custom metadata in a single
 * structured output LLM call. Uses `Output.object` with a Zod schema that always
 * includes title + description, plus any custom fields from the metadata schema.
 */
export async function generateDocumentMetadata(
  text: string,
  llm: LanguageModel,
  metadataSchema?: Record<
    string,
    { type: 'string' | 'number' | 'boolean' | 'string[]'; allowedValues?: unknown[]; description?: string }
  >,
): Promise<{ title: string; description: string; customMetadata: Record<string, unknown> }> {
  const { buildDocumentMetadataSchema } = await import('@typhoon/types');
  const sample = text.slice(0, METADATA_EXTRACTION_MAX_CHARS);
  const zodSchema = buildDocumentMetadataSchema(metadataSchema);

  const hasCustomFields = metadataSchema && Object.keys(metadataSchema).length > 0;

  let fieldDescriptions = '';
  if (hasCustomFields) {
    fieldDescriptions = Object.entries(metadataSchema)
      .map(([key, field]) => {
        let desc = `- ${key} (${field.type})`;
        if (field.description) desc += `: ${field.description}`;
        if (field.allowedValues?.length) desc += ` [allowed: ${field.allowedValues.join(', ')}]`;
        return desc;
      })
      .join('\n');
  }

  const prompt = `Extract metadata from the following document text.

Rules:
- title: A short descriptive title for the document.
- description: A single sentence describing what the document is about.${
    hasCustomFields
      ? `
- For fields with allowed values, choose the MOST SPECIFIC value that matches the document content. Do not default to generic or catch-all values when a more specific value applies.
- If a custom field cannot be determined from the text, return null for it.
- Base your extraction on the actual content of the document, not assumptions.

Additional fields to extract:
${fieldDescriptions}`
      : ''
  }

Document text:
${sample}`;

  const tStart = Date.now();
  log.debug('Calling generateText for document metadata', {
    promptLength: prompt.length,
    textSampleLength: sample.length,
    hasCustomFields: !!hasCustomFields,
    customFieldCount: hasCustomFields ? Object.keys(metadataSchema).length : 0,
  });

  const { output } = await generateText({
    model: llm,
    output: Output.object({ schema: zodSchema }),
    prompt,
    temperature: 0,
  });

  const object = (output ?? {}) as Record<string, unknown>;
  const title = (typeof object.title === 'string' ? object.title : 'Untitled').replace(/^#+\s*/, '');
  const description = typeof object.description === 'string' ? object.description : '';

  // Separate custom fields from title/description and validate against schema
  const customMetadata: Record<string, unknown> = {};
  if (hasCustomFields) {
    for (const [key, value] of Object.entries(object)) {
      if (key === 'title' || key === 'description') continue;
      if (value === undefined || value === null) continue;
      if (!(key in metadataSchema)) continue;
      const field = metadataSchema[key];
      if (field.allowedValues?.length) {
        if (Array.isArray(value)) {
          if (!value.every((v) => field.allowedValues?.includes(v))) continue;
        } else {
          if (!field.allowedValues.includes(value)) continue;
        }
      }
      customMetadata[key] = value;
    }
  }

  log.debug('Document metadata result', {
    title,
    customFieldsExtracted: Object.keys(customMetadata),
    ms: Date.now() - tStart,
  });

  return { title, description, customMetadata };
}

/** Generate a deterministic chunk ID from its content so re-ingestion produces stable IDs. */
export function makeChunkId(documentId: string, startIndex: number | null, text: string): string {
  return createHash('sha256')
    .update(`${documentId}:${startIndex ?? ''}:${text.slice(0, 200)}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Group searchable custom metadata values by their tsvector weight tier.
 * Returns `_searchMeta_{A,B,C,D}` keys ready to spread into chunk metadata.
 * The tsvector trigger indexes each key at the corresponding PostgreSQL weight.
 */
export function buildSearchMetaFields(
  customMetadata: Record<string, unknown>,
  fieldSchema?: Record<string, { searchable?: boolean; searchPriority?: SearchPriority; [key: string]: unknown }>,
): Record<string, string> {
  const buckets: Record<string, string[]> = { A: [], B: [], C: [], D: [] };

  for (const [key, value] of Object.entries(customMetadata)) {
    if (value === null || value === undefined || value === '') continue;

    const field = fieldSchema?.[key];
    // Opt-in: only include fields explicitly marked searchable or with a searchPriority
    if (!field?.searchable && !field?.searchPriority) continue;

    const priority: SearchPriority = field?.searchPriority ?? 'moderate';
    const weight = SEARCH_PRIORITY_TO_WEIGHT[priority];
    const text = Array.isArray(value) ? value.join(' ') : String(value);
    buckets[weight].push(text);
  }

  const result: Record<string, string> = {};
  for (const [tier, values] of Object.entries(buckets)) {
    if (values.length > 0) {
      result[`_searchMeta_${tier}`] = values.join(' ');
    }
  }
  return result;
}

export async function deleteDocumentVectors(vectorStore: PgVector, documentId: string): Promise<void> {
  await vectorStore.deleteVectors({
    indexName: 'knowledge_base',
    filter: { documentId },
  });
}

export async function updateDocumentVectorSource(
  sqlInstance: { unsafe: (...args: never[]) => unknown },
  documentId: string,
  newSource: string,
): Promise<void> {
  const fn = sqlInstance.unsafe as (query: string, params: string[]) => Promise<unknown>;
  await fn(
    `UPDATE "knowledge_base"
     SET metadata = jsonb_set(metadata, '{source}', to_jsonb($2::text))
     WHERE metadata->>'documentId' = $1`,
    [documentId, newSource],
  );
}

/** Merge custom metadata keys into existing chunk JSONB without touching embeddings. */
export async function updateDocumentVectorMetadata(
  sqlInstance: { unsafe: (...args: never[]) => unknown },
  documentId: string,
  customMetadata: Record<string, unknown>,
): Promise<void> {
  const fn = sqlInstance.unsafe as (query: string, params: (string | null)[]) => Promise<unknown>;
  await fn(
    `UPDATE "knowledge_base"
     SET metadata = metadata || $2::jsonb
     WHERE metadata->>'documentId' = $1`,
    [documentId, JSON.stringify(customMetadata)],
  );
}

/** Strip old _searchMeta_* fields and merge new ones into chunk metadata. Triggers tsvector recomputation. */
export async function refreshDocumentSearchMeta(
  sqlInstance: { unsafe: (...args: never[]) => unknown },
  documentId: string,
  searchMetaFields: Record<string, string>,
): Promise<void> {
  const fn = sqlInstance.unsafe as (query: string, params: (string | null)[]) => Promise<unknown>;
  await fn(
    `UPDATE "knowledge_base"
     SET metadata = (metadata - '_searchMeta_A' - '_searchMeta_B' - '_searchMeta_C' - '_searchMeta_D') || $2::jsonb
     WHERE metadata->>'documentId' = $1`,
    [documentId, JSON.stringify(searchMetaFields)],
  );
}

/** Update the title field in chunk metadata when a document's title is edited. */
export async function updateDocumentVectorTitle(
  sqlInstance: { unsafe: (...args: never[]) => unknown },
  documentId: string,
  newTitle: string,
): Promise<void> {
  const fn = sqlInstance.unsafe as (query: string, params: string[]) => Promise<unknown>;
  await fn(
    `UPDATE "knowledge_base"
     SET metadata = jsonb_set(metadata, '{title}', to_jsonb($2::text))
     WHERE metadata->>'documentId' = $1`,
    [documentId, newTitle],
  );
}
