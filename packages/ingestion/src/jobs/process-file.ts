import type { Db } from '@typhoon/db';
import { documents } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { PgVector } from '@typhoon/pg';
import { createS3Client, downloadObject } from '@typhoon/storage';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { deleteDocumentVectors, processFile } from '../pipeline.js';
import { getSource } from '../source-registry.js';
import type { ProcessFileJobData } from './queues.js';

const log = createAppLogger('process-file');

export async function handleProcessFileJob(job: Job<ProcessFileJobData>, db: Db, vectorStore: PgVector): Promise<void> {
  const { documentId, s3Key, bucketName, sourceName, isUpdate } = job.data;

  const source = sourceName ? getSource(sourceName) : undefined;
  const s3Client = createS3Client({
    S3_ENDPOINT: source?.credentials.endpoint ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    S3_REGION: source?.credentials.region ?? process.env.S3_REGION ?? 'us-east-1',
    S3_ACCESS_KEY: source?.credentials.accessKey ?? process.env.S3_ACCESS_KEY ?? '',
    S3_SECRET_KEY: source?.credentials.secretKey ?? process.env.S3_SECRET_KEY ?? '',
    S3_BUCKET: bucketName,
  });

  log.info('Processing file', { documentId, s3Key, isUpdate });

  try {
    // Download file from S3
    const content = await downloadObject(s3Client, bucketName, s3Key);

    // If updating, delete old vectors first
    if (isUpdate) {
      await deleteDocumentVectors(vectorStore, documentId);
    }

    // Process through pipeline: parse → chunk → embed → upsert
    const result = await processFile(
      {
        content,
        filename: s3Key,
        documentId,
        syncTargetId: job.data.syncTargetId,
        s3Key,
      },
      vectorStore,
    );

    // Update document record
    await db
      .update(documents)
      .set({
        status: 'ready',
        chunkCount: result.chunkCount,
        mimeType: guessMimeType(s3Key),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    log.info('File processed', { documentId, s3Key, chunkCount: result.chunkCount });
  } catch (error) {
    log.error('File processing failed', {
      documentId,
      s3Key,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(documents)
      .set({
        status: 'parse_error',
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
    throw error;
  }
}

function guessMimeType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}
