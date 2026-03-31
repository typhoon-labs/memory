import type { Db } from '@typhoon/db';
import { documents, syncJobs, syncTargets } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import { createS3Client } from '@typhoon/storage';
import type { Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getSource } from '../source-registry.js';
import { computeSyncDiff } from '../sync.js';
import type { DeleteFileJobData, ProcessFileJobData, ScanJobData } from './queues.js';

const log = createAppLogger('sync-scan');

export async function handleScanJob(job: Job<ScanJobData>, db: Db, syncQueue: Queue): Promise<void> {
  const { syncTargetId } = job.data;

  // Load sync target config
  const [target] = await db.select().from(syncTargets).where(eq(syncTargets.id, syncTargetId));
  if (!target || !target.isActive) {
    log.debug('Skipping inactive or missing sync target', { syncTargetId });
    return;
  }

  log.info('Starting sync scan', { syncTargetId, targetName: target.name });

  // Create sync job record
  const [syncJob] = await db.insert(syncJobs).values({ syncTargetId }).returning();

  // Resolve S3 credentials from source registry, fall back to env vars for legacy targets
  const source = target.source ? getSource(target.source) : undefined;
  const s3Config = target.config as { bucket: string; prefix?: string };
  const s3Client = createS3Client({
    S3_ENDPOINT: source?.credentials.endpoint ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    S3_REGION: source?.credentials.region ?? process.env.S3_REGION ?? 'us-east-1',
    S3_ACCESS_KEY: source?.credentials.accessKey ?? process.env.S3_ACCESS_KEY ?? '',
    S3_SECRET_KEY: source?.credentials.secretKey ?? process.env.S3_SECRET_KEY ?? '',
    S3_BUCKET: s3Config.bucket,
  });

  try {
    const diff = await computeSyncDiff(s3Client, db, s3Config.bucket, s3Config.prefix ?? '', syncTargetId);

    log.info('Sync diff computed', {
      syncTargetId,
      new: diff.newFiles.length,
      updated: diff.updatedFiles.length,
      deleted: diff.deletedDocumentIds.length,
    });

    // Enqueue new files
    for (const file of diff.newFiles) {
      const [doc] = await db
        .insert(documents)
        .values({
          syncTargetId,
          s3Key: file.key,
          s3Etag: file.etag,
          fileSize: file.size,
          status: 'processing',
          lastSyncedAt: new Date(),
        })
        .returning();

      await syncQueue.add('process-file', {
        syncTargetId,
        documentId: doc.id,
        s3Key: file.key,
        s3Etag: file.etag,
        bucketName: s3Config.bucket,
        sourceName: target.source ?? undefined,
        isUpdate: false,
      } satisfies ProcessFileJobData);
    }

    // Enqueue updated files (includes error retries)
    for (const file of diff.updatedFiles) {
      const [doc] = await db
        .update(documents)
        .set({
          s3Etag: file.etag,
          status: 'processing',
          errorMessage: null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.s3Key, file.key))
        .returning();

      if (doc) {
        await syncQueue.add('process-file', {
          syncTargetId,
          documentId: doc.id,
          s3Key: file.key,
          s3Etag: file.etag,
          bucketName: s3Config.bucket,
          sourceName: target.source ?? undefined,
          isUpdate: true,
        } satisfies ProcessFileJobData);
      }
    }

    // Enqueue deletions
    for (const docId of diff.deletedDocumentIds) {
      await syncQueue.add('delete-file', { documentId: docId } satisfies DeleteFileJobData);
    }

    // Update sync job record
    await db
      .update(syncJobs)
      .set({
        status: 'completed',
        filesScanned: diff.newFiles.length + diff.updatedFiles.length + diff.deletedDocumentIds.length,
        filesNew: diff.newFiles.length,
        filesUpdated: diff.updatedFiles.length,
        filesDeleted: diff.deletedDocumentIds.length,
        completedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJob.id));
  } catch (error) {
    log.error('Scan job failed', { syncTargetId, error: error instanceof Error ? error.message : String(error) });
    await db
      .update(syncJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJob.id));
    throw error;
  }
}
