/** A sync target row returned by the API. */
export interface SyncTarget {
  id: string;
  name: string;
  sourceType: string;
  config: Record<string, unknown>;
  cronSchedule: string;
  isActive: boolean;
  managedBy: 'config' | 'manual' | null;
  source: string | null;
  metadataTemplateId: string | null;
  autoExtractMetadata: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /v1/sync-targets. */
export interface CreateSyncTargetInput {
  name: string;
  sourceType: string;
  config: Record<string, unknown>;
  cronSchedule?: string;
  isActive?: boolean;
  source?: string;
  metadataTemplateId?: string | null;
  autoExtractMetadata?: boolean;
}

/** Payload for PATCH /v1/sync-targets/:id. */
export type UpdateSyncTargetInput = Partial<CreateSyncTargetInput>;

/** A sync job row. */
export interface SyncJob {
  id: string;
  syncTargetId: string;
  status: 'running' | 'completed' | 'failed';
  filesScanned: number;
  filesNew: number;
  filesUpdated: number;
  filesDeleted: number;
  filesErrored: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Entry in the browse response for S3-backed targets. */
export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
}

/** Payload for POST /v1/sync-targets/:id/sync. */
export interface SyncInput {
  force?: boolean;
}

/** Source type definition returned by GET /v1/sources. */
export interface SourceDefinition {
  type: string;
  label: string;
  configSchema: Record<string, unknown>;
}

/** Payload for POST /v1/sync-targets/:id/folders. */
export interface CreateFolderInput {
  path: string;
}

/** Payload for POST /v1/sync-targets/:id/folders/delete. */
export interface DeleteFolderInput {
  path: string;
}

/** Payload for POST /v1/sync-targets/:id/folders/move. */
export interface MoveFolderInput {
  oldPath: string;
  newPath: string;
}
