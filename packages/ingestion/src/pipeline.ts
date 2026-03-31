import { MDocument } from '@mastra/rag';
import { createEmbeddingModel } from '@typhoon/ai';
import { createAppLogger } from '@typhoon/logger';
import type { PgVector } from '@typhoon/pg';
import { embedMany } from 'ai';
import { getMDocFormat, getParser, needsCustomParser } from './parsers/registry.js';

const log = createAppLogger('pipeline');

export interface ProcessFileInput {
  content: Buffer;
  filename: string;
  documentId: string;
  syncTargetId: string;
  s3Key: string;
  title?: string;
}

export interface ProcessFileResult {
  chunkCount: number;
}

export async function processFile(input: ProcessFileInput, vectorStore: PgVector): Promise<ProcessFileResult> {
  const { content, filename, documentId, syncTargetId, s3Key, title } = input;

  // 1. Parse if needed, or use raw text
  let text: string;
  let format: 'text' | 'html' | 'markdown' | 'json';

  if (needsCustomParser(filename)) {
    const parser = getParser(filename);
    if (!parser) throw new Error(`No parser for ${filename}`);
    const result = await parser(content, filename);
    text = result.text;
    format = result.format;
  } else {
    text = content.toString('utf-8');
    format = getMDocFormat(filename);
  }

  if (!text.trim()) {
    log.debug('Empty content, skipping', { filename });
    return { chunkCount: 0 };
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

  // 3. Chunk using Mastra's built-in strategy
  const chunkOptions =
    format === 'markdown'
      ? { strategy: 'markdown' as const, maxSize: 512, overlap: 50 }
      : format === 'html'
        ? {
            strategy: 'html' as const,
            headers: [
              ['h1', 'title'],
              ['h2', 'section'],
              ['h3', 'subsection'],
            ] as [string, string][],
          }
        : { strategy: 'recursive' as const, maxSize: 512, overlap: 50 };
  const chunks = await mDoc.chunk(chunkOptions);

  log.debug('Chunked document', { filename, chunks: chunks.length, format });

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // 4. Embed using AI SDK
  const { embeddings } = await embedMany({
    model: createEmbeddingModel(),
    values: chunks.map((c) => c.text),
  });

  log.debug('Embedded chunks', { filename, embeddings: embeddings.length });

  // 5. Upsert to PgVector
  await vectorStore.upsert({
    indexName: 'knowledge_base',
    vectors: embeddings,
    metadata: chunks.map((chunk) => ({
      text: chunk.text,
      documentId,
      syncTargetId,
      source: s3Key,
      title: title ?? filename,
    })),
  });

  log.debug('Upserted vectors', { documentId, chunkCount: chunks.length });

  return { chunkCount: chunks.length };
}

export async function deleteDocumentVectors(vectorStore: PgVector, documentId: string): Promise<void> {
  await vectorStore.deleteVectors({
    indexName: 'knowledge_base',
    filter: { documentId },
  });
}
