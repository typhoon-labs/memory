/** Document status enum matching the backend Zod schema. */
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error' | 'deleted';

/** A document row returned by GET /v1/documents and /v1/documents/:id. */
export interface Document {
  id: string;
  syncTargetId: string;
  sourceKey: string;
  sourceEtag: string | null;
  mimeType: string | null;
  fileSize: number | null;
  title: string | null;
  author: string | null;
  description?: string | null;
  pageCount: number | null;
  status: DocumentStatus;
  errorMessage: string | null;
  chunkCount: number;
  customMetadata: Record<string, unknown>;
  contentHash: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single chunk returned by GET /v1/documents/:id/chunks. */
export interface DocumentChunk {
  text: string;
  startIndex: number | null;
}

/** Metadata about the document returned alongside its chunks. */
export interface DocumentMeta {
  id: string;
  title: string | null;
  description: string | null;
  sourceKey: string;
  mimeType: string | null;
  chunkCount: number;
  fileSize: number | null;
}

/** Response from GET /v1/documents/:id/chunks. */
export interface DocumentContentResponse {
  document: DocumentMeta;
  chunks: DocumentChunk[];
}

/** Response from GET /v1/documents/:id/parsed-content. */
export interface DocumentParsedResponse {
  text: string;
}

/** Payload for PATCH /v1/documents/:id. */
export interface UpdateDocumentInput {
  title?: string | null;
  description?: string | null;
  customMetadata?: Record<string, unknown>;
}

/** Payload for POST /v1/documents/bulk-metadata. */
export interface BulkMetadataInput {
  ids: string[];
  customMetadata: Record<string, unknown>;
  merge?: boolean;
}

/** Payload for POST /v1/documents/bulk-delete. */
export interface BulkDeleteInput {
  ids: string[];
}

/** Payload for POST /v1/documents/:id/move. */
export interface MoveDocumentInput {
  newSourceKey: string;
}

/** Metadata field info returned by GET /v1/documents/metadata-fields. */
export interface MetadataFieldInfo {
  field: string;
  values: unknown[];
}
