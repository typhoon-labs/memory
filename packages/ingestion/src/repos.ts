import type { DocumentRepo, MetadataRepo, SyncJobRepo, SyncTargetRepo } from '@typhoon/db/repos';

/** Repositories required by ingestion job handlers. */
export interface IngestionRepos {
  syncTargetRepo: SyncTargetRepo;
  syncJobRepo: SyncJobRepo;
  documentRepo: DocumentRepo;
  metadataRepo: MetadataRepo;
}
