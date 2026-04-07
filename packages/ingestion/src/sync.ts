import { createAppLogger } from '@typhoon/logger';
import type { SourceObject } from './providers/types.js';

const log = createAppLogger('sync');

export interface SyncDiff {
  newFiles: SourceObject[];
  updatedFiles: SourceObject[];
  deletedDocumentIds: string[];
}

interface ExistingDoc {
  id: string;
  sourceKey: string;
  sourceEtag: string | null;
  status: string;
}

export function computeSyncDiff(
  sourceObjects: SourceObject[],
  existingDocs: ExistingDoc[],
  options?: { force?: boolean },
): SyncDiff {
  const existingByKey = new Map(existingDocs.map((d) => [d.sourceKey, d]));
  const sourceKeys = new Set(sourceObjects.map((o) => o.key));

  const newFiles: SourceObject[] = [];
  const updatedFiles: SourceObject[] = [];
  const deletedDocumentIds: string[] = [];

  const retryStatuses = new Set(['parse_error', 'embed_error', 'deleted']);

  for (const obj of sourceObjects) {
    const existing = existingByKey.get(obj.key);
    if (!existing) {
      newFiles.push(obj);
    } else if (options?.force) {
      updatedFiles.push(obj);
    } else if (existing.sourceEtag !== obj.etag) {
      updatedFiles.push(obj);
    } else if (retryStatuses.has(existing.status)) {
      updatedFiles.push(obj);
    }
  }

  for (const doc of existingDocs) {
    if (doc.status !== 'deleted' && !sourceKeys.has(doc.sourceKey)) {
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
