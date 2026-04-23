import { createHash } from 'node:crypto';
import { MDocument } from '@mastra/rag';
import { createEmbeddingModel, createExtractionModel, EMBEDDING_MAX_CHUNK_CHARS } from '@typhoon/ai';
import type { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import type { LanguageModel } from 'ai';
import { embedMany, generateText } from 'ai';
import { getMDocFormat, getParser, needsCustomParser } from './parsers/registry';
import { createRateLimiter } from './util/rate-limiter';
import { recordStageDuration } from './util/stage-metrics';
import { withTimeout } from './util/with-timeout';

const log = createAppLogger('pipeline');

/**
 * Re-export from @typhoon/ai for test access. The value comes from
 * EMBEDDING_MAX_CHUNK_CHARS env var (default 24,000).
 */
export { EMBEDDING_MAX_CHUNK_CHARS };

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
}

export interface ProcessFileResult {
  chunkCount: number;
  title: string | null;
  description: string | null;
}

export async function processFile(input: ProcessFileInput, vectorStore: PgVector): Promise<ProcessFileResult> {
  const { content, filename, documentId, syncTargetId, sourceKey, title, onStage, isCancelled } = input;
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

  // 1. Parse if needed, or use raw text
  let text: string;
  let format: 'text' | 'html' | 'markdown' | 'json';

  if (needsCustomParser(filename)) {
    const parser = getParser(filename);
    if (!parser) throw new Error(`No parser for ${filename}`);
    await announce('parse');
    const t0 = Date.now();
    const result = await withTimeout(parser(content, filename), STAGE_TIMEOUTS.parse, 'parse');
    text = result.text;
    format = result.format;
    const parseMs = Date.now() - t0;
    recordStageDuration('parse', parseMs);
    log.info('Parsed document', { filename, ms: parseMs, chars: text.length });
  } else {
    text = content.toString('utf-8');
    format = getMDocFormat(filename);
  }

  if (!text.trim()) {
    log.info('Empty content, skipping', { filename });
    return { chunkCount: 0, title: null, description: null };
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
  // biome-ignore lint/suspicious/noExplicitAny: Mastra extract types expect MastraLanguageModel but AI SDK LanguageModelV3 works at runtime
  const extractionLlm = createExtractionModel() as any;
  const extract = {
    keywords: { llm: extractionLlm, keywords: 5 },
  };

  const chunkOptions = buildChunkOptions(format, extract);

  if (await checkCancelled()) return { chunkCount: 0, title: null, description: null };

  await announce('chunk');
  const tChunk = Date.now();
  const rawChunks = await withTimeout(mDoc.chunk(chunkOptions), STAGE_TIMEOUTS.chunk, 'chunk');
  const chunks = enforceChunkSizeLimit(rawChunks, EMBEDDING_MAX_CHUNK_CHARS);
  const chunkMs = Date.now() - tChunk;
  recordStageDuration('chunk', chunkMs);
  log.info('Chunked document', { filename, chunks: chunks.length, format, ms: chunkMs });

  if (chunks.length === 0) {
    return { chunkCount: 0, title: null, description: null };
  }

  // 4. Generate document-level title and description
  await announce('metadata');
  const tMeta = Date.now();
  const docMeta = await withTimeout(generateDocumentMetadata(text, extractionLlm), STAGE_TIMEOUTS.metadata, 'metadata');
  const metaMs = Date.now() - tMeta;
  recordStageDuration('metadata', metaMs);
  log.info('Generated document metadata', { filename, title: docMeta.title, ms: metaMs });

  if (await checkCancelled()) return { chunkCount: 0, title: null, description: null };

  // 5. Embed using AI SDK (rate-limited)
  await announce('embed');
  const tEmbed = Date.now();
  await embeddingLimiter.acquire();
  let embeddings: number[][];
  try {
    const result = await withTimeout(
      embedMany({
        model: createEmbeddingModel(),
        values: chunks.map((c) => c.text),
      }),
      STAGE_TIMEOUTS.embed,
      'embed',
    );
    embeddings = result.embeddings;
  } finally {
    embeddingLimiter.release();
  }
  const embedMs = Date.now() - tEmbed;
  recordStageDuration('embed', embedMs);
  log.info('Embedded chunks', { filename, embeddings: embeddings.length, ms: embedMs });

  // 5. Compute startIndex for chunks that don't have one (e.g. semantic-markdown strategy)
  const startIndices: (number | null)[] = [];
  let searchFrom = 0;
  for (const chunk of chunks) {
    const existing = (chunk.metadata as Record<string, unknown>)?.startIndex;
    if (typeof existing === 'number') {
      startIndices.push(existing);
      searchFrom = existing + chunk.text.length;
    } else {
      const idx = text.indexOf(chunk.text.slice(0, 80), searchFrom);
      startIndices.push(idx >= 0 ? idx : null);
      if (idx >= 0) searchFrom = idx + chunk.text.length;
    }
  }

  if (await checkCancelled()) return { chunkCount: 0, title: null, description: null };

  // 6. Upsert to PgVector with extracted metadata
  const docTitle = title ?? docMeta.title;
  await announce('upsert');
  const tUpsert = Date.now();
  const chunkIds = chunks.map((chunk, i) => makeChunkId(documentId, startIndices[i], chunk.text));

  await withTimeout(
    vectorStore.upsert({
      indexName: 'knowledge_base',
      ids: chunkIds,
      vectors: embeddings,
      metadata: chunks.map((chunk, i) => ({
        text: chunk.text,
        documentId,
        syncTargetId,
        source: sourceKey,
        title: docTitle,
        section: (chunk.metadata as Record<string, unknown>)?.section ?? '',
        keywords: (chunk.metadata as Record<string, unknown>)?.excerptKeywords ?? '',
        startIndex: startIndices[i],
      })),
    }),
    STAGE_TIMEOUTS.upsert,
    'upsert',
  );

  const upsertMs = Date.now() - tUpsert;
  recordStageDuration('upsert', upsertMs);
  log.info('Upserted vectors', { documentId, chunkCount: chunks.length, ms: upsertMs });

  return { chunkCount: chunks.length, title: docTitle, description: docMeta.description || null };
}

/**
 * Split any chunk exceeding the embedding model's input limit.
 * Splits on paragraph boundaries, then sentence boundaries, then hard character split.
 * Preserves metadata from the parent chunk on each sub-chunk.
 */
export function enforceChunkSizeLimit(
  chunks: Array<{ text: string; metadata: Record<string, unknown> }>,
  maxChars: number,
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

    const subTexts = splitOversizedText(chunk.text, maxChars);
    for (const sub of subTexts) {
      result.push({ text: sub, metadata: { ...chunk.metadata } });
    }
  }

  return result;
}

function splitOversizedText(text: string, maxChars: number): string[] {
  // Try paragraph boundaries first
  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length > 1) {
    return reassemble(paragraphs, maxChars, '\n\n');
  }

  // Fall back to sentence boundaries
  const sentences = text.split(/(?<=\.)\s+/);
  if (sentences.length > 1) {
    return reassemble(sentences, maxChars, ' ');
  }

  // Last resort: hard character split
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    pieces.push(text.slice(i, i + maxChars));
  }
  return pieces;
}

function reassemble(parts: string[], maxChars: number, joiner: string): string[] {
  const result: string[] = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? current + joiner + part : part;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) result.push(current);
      if (part.length > maxChars) {
        result.push(...splitOversizedText(part, maxChars));
        current = '';
      } else {
        current = part;
      }
    }
  }
  if (current) result.push(current);
  return result;
}

export function buildChunkOptions(format: string, extract: Record<string, unknown>) {
  switch (format) {
    case 'markdown':
      return {
        strategy: 'semantic-markdown' as const,
        joinThreshold: 500,
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
        maxSize: EMBEDDING_MAX_CHUNK_CHARS,
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

export async function generateDocumentMetadata(
  text: string,
  llm: LanguageModel,
): Promise<{ title: string; description: string }> {
  const sample = text.slice(0, 2000);
  const { text: response } = await generateText({
    model: llm,
    temperature: 0,
    system:
      'You generate metadata for documents. Respond with exactly two lines, no markdown formatting.\nLine 1: A short descriptive title for the document.\nLine 2: A single sentence describing what the document is about.',
    prompt: sample,
  });
  const lines = response.trim().split('\n').filter(Boolean);
  return {
    title: (lines[0]?.trim() ?? 'Untitled').replace(/^#+\s*/, ''),
    description: (lines[1]?.trim() ?? '').replace(/^#+\s*/, ''),
  };
}

/** Generate a deterministic chunk ID from its content so re-ingestion produces stable IDs. */
export function makeChunkId(documentId: string, startIndex: number | null, text: string): string {
  return createHash('sha256')
    .update(`${documentId}:${startIndex ?? ''}:${text.slice(0, 200)}`)
    .digest('hex')
    .slice(0, 32);
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
