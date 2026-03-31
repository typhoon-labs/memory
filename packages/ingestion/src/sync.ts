import type { S3Client } from '@aws-sdk/client-s3';
import type { Db } from '@typhoon/db';
import { documents } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { S3Object } from '@typhoon/storage';
import { listObjects } from '@typhoon/storage';
import { eq } from 'drizzle-orm';

const log = createAppLogger('sync');

export interface SyncDiff {
  newFiles: S3Object[];
  updatedFiles: S3Object[];
  deletedDocumentIds: string[];
}

export async function computeSyncDiff(
  s3Client: S3Client,
  db: Db,
  bucketName: string,
  prefix: string,
  syncTargetId: string,
): Promise<SyncDiff> {
  log.debug('Computing sync diff', { bucket: bucketName, prefix, syncTargetId });

  // 1. List all S3 objects
  const s3Objects = await listObjects(s3Client, bucketName, prefix);

  // 2. Get existing documents from DB
  const existingDocs = await db.select().from(documents).where(eq(documents.syncTargetId, syncTargetId));

  const existingByKey = new Map(existingDocs.map((d) => [d.s3Key, d]));
  const s3Keys = new Set(s3Objects.map((o) => o.key));

  const newFiles: S3Object[] = [];
  const updatedFiles: S3Object[] = [];
  const deletedDocumentIds: string[] = [];

  const retryStatuses = new Set(['parse_error', 'embed_error', 'deleted']);

  // 3. Find new, updated, and previously-failed files
  for (const obj of s3Objects) {
    const existing = existingByKey.get(obj.key);
    if (!existing) {
      newFiles.push(obj);
    } else if (existing.s3Etag !== obj.etag) {
      updatedFiles.push(obj);
    } else if (retryStatuses.has(existing.status)) {
      // Retry documents that failed on a previous sync
      updatedFiles.push(obj);
    }
  }

  // 4. Find deleted files
  for (const doc of existingDocs) {
    if (doc.status !== 'deleted' && !s3Keys.has(doc.s3Key)) {
      deletedDocumentIds.push(doc.id);
    }
  }

  log.debug('Sync diff result', {
    new: newFiles.length,
    updated: updatedFiles.length,
    deleted: deletedDocumentIds.length,
  });

  return { newFiles, updatedFiles, deletedDocumentIds };
}
