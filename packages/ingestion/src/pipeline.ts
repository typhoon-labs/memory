import { MDocument } from '@mastra/rag';
import { createEmbeddingModel, createExtractionModel } from '@typhoon/ai';
import { createAppLogger } from '@typhoon/logger';
import type { PgVector } from '@typhoon/pg';
import type { LanguageModel } from 'ai';
import { embedMany, generateText } from 'ai';
import { getMDocFormat, getParser, needsCustomParser } from './parsers/registry.js';
import { withTimeout } from './util/with-timeout.js';

const log = createAppLogger('pipeline');

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
}

export interface ProcessFileResult {
  chunkCount: number;
  title: string | null;
  description: string | null;
}

export async function processFile(input: ProcessFileInput, vectorStore: PgVector): Promise<ProcessFileResult> {
  const { content, filename, documentId, syncTargetId, sourceKey, title, onStage } = input;
  const announce = async (stage: string) => {
    if (onStage) await onStage(stage);
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
    log.info('Parsed document', { filename, ms: Date.now() - t0, chars: text.length });
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

  await announce('chunk');
  const tChunk = Date.now();
  const chunks = await withTimeout(mDoc.chunk(chunkOptions), STAGE_TIMEOUTS.chunk, 'chunk');

  log.info('Chunked document', { filename, chunks: chunks.length, format, ms: Date.now() - tChunk });

  if (chunks.length === 0) {
    return { chunkCount: 0, title: null, description: null };
  }

  // 4. Generate document-level title and description
  await announce('metadata');
  const tMeta = Date.now();
  const docMeta = await withTimeout(generateDocumentMetadata(text, extractionLlm), STAGE_TIMEOUTS.metadata, 'metadata');
  log.info('Generated document metadata', { filename, title: docMeta.title, ms: Date.now() - tMeta });

  // 5. Embed using AI SDK
  await announce('embed');
  const tEmbed = Date.now();
  const { embeddings } = await withTimeout(
    embedMany({
      model: createEmbeddingModel(),
      values: chunks.map((c) => c.text),
    }),
    STAGE_TIMEOUTS.embed,
    'embed',
  );

  log.info('Embedded chunks', { filename, embeddings: embeddings.length, ms: Date.now() - tEmbed });

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

  // 6. Upsert to PgVector with extracted metadata
  const docTitle = title ?? docMeta.title;
  await announce('upsert');
  const tUpsert = Date.now();
  await withTimeout(
    vectorStore.upsert({
      indexName: 'knowledge_base',
      vectors: embeddings,
      metadata: chunks.map((chunk, i) => ({
        text: chunk.text,
        documentId,
        syncTargetId,
        source: sourceKey,
        title: docTitle,
        keywords: (chunk.metadata as Record<string, unknown>)?.excerptKeywords ?? '',
        startIndex: startIndices[i],
      })),
    }),
    STAGE_TIMEOUTS.upsert,
    'upsert',
  );

  log.info('Upserted vectors', { documentId, chunkCount: chunks.length, ms: Date.now() - tUpsert });

  return { chunkCount: chunks.length, title: docTitle, description: docMeta.description || null };
}

function buildChunkOptions(format: string, extract: Record<string, unknown>) {
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
        addStartIndex: true,
        extract,
      };
    case 'json':
      return { strategy: 'token' as const, maxSize: 512, overlap: 50, addStartIndex: true, extract };
    default:
      return { strategy: 'sentence' as const, maxSize: 512, overlap: 50, addStartIndex: true, extract };
  }
}

async function generateDocumentMetadata(
  text: string,
  llm: LanguageModel,
): Promise<{ title: string; description: string }> {
  const sample = text.slice(0, 2000);
  const { text: response } = await generateText({
    model: llm,
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
