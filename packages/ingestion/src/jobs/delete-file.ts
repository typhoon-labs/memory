import type { Db } from '@typhoon/db';
import { documents } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import type { PgVector } from '@typhoon/pg';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { deleteDocumentVectors } from '../pipeline.js';
import type { DeleteFileJobData } from './queues.js';

const log = createAppLogger('delete-file');

export async function handleDeleteFileJob(job: Job<DeleteFileJobData>, db: Db, vectorStore: PgVector): Promise<void> {
  const { documentId } = job.data;

  log.info('Deleting document vectors', { documentId });

  // Remove vectors from PgVector
  await deleteDocumentVectors(vectorStore, documentId);

  // Mark document as deleted
  await db.update(documents).set({ status: 'deleted', updatedAt: new Date() }).where(eq(documents.id, documentId));

  log.debug('Document marked deleted', { documentId });
}
