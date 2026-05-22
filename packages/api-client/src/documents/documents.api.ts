import { apiFetch } from '../client';
import type {
  BulkDeleteInput,
  BulkMetadataInput,
  Document,
  DocumentContentResponse,
  DocumentParsedResponse,
  MetadataFieldInfo,
  MoveDocumentInput,
  UpdateDocumentInput,
} from './documents.types';

/** Low-level document API calls. */
export const documentsApi = {
  /** List documents, optionally filtered by sync target. */
  list: (syncTargetId?: string) => {
    const params = syncTargetId ? `?syncTargetId=${encodeURIComponent(syncTargetId)}` : '';
    return apiFetch<Document[]>(`/api/v1/documents${params}`);
  },

  /** Get a single document by ID. */
  getById: (id: string) => apiFetch<Document>(`/api/v1/documents/${id}`),

  /** Get document chunks (assembled content from DB). */
  getChunks: (id: string) => apiFetch<DocumentContentResponse>(`/api/v1/documents/${id}/chunks`),

  /** Get parsed content (raw text from S3). */
  getParsedContent: (id: string) => apiFetch<DocumentParsedResponse>(`/api/v1/documents/${id}/parsed-content`),

  /** Download the original file. Returns a Blob via fetch. */
  download: (id: string) =>
    fetch(`/api/v1/documents/${id}/download`, { credentials: 'include' }).then((r) => {
      if (!r.ok) throw new Error(`Download failed: ${r.status}`);
      return r.blob();
    }),

  /** Update document metadata (title, description, custom metadata). */
  update: (id: string, data: UpdateDocumentInput) =>
    apiFetch<Document>(`/api/v1/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Retry a failed document. */
  retry: (id: string) =>
    apiFetch<Document>(`/api/v1/documents/${id}/retry`, {
      method: 'POST',
    }),

  /** Re-sync a document (re-ingest from source). */
  resync: (id: string) =>
    apiFetch<Document>(`/api/v1/documents/${id}/resync`, {
      method: 'POST',
    }),

  /** Delete a single document. */
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/documents/${id}`, {
      method: 'DELETE',
    }),

  /** Bulk delete documents. */
  bulkDelete: (data: BulkDeleteInput) =>
    apiFetch<{ deleted: number }>('/api/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Bulk update custom metadata on multiple documents. */
  bulkMetadata: (data: BulkMetadataInput) =>
    apiFetch<{ updated: number }>('/api/v1/documents/bulk-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Get distinct metadata field values, optionally scoped to a sync target. */
  metadataFields: (syncTargetId?: string) => {
    const params = syncTargetId ? `?syncTargetId=${encodeURIComponent(syncTargetId)}` : '';
    return apiFetch<MetadataFieldInfo[]>(`/api/v1/documents/metadata-fields${params}`);
  },

  /** Move a document to a new source key. */
  move: (id: string, data: MoveDocumentInput) =>
    apiFetch<Document>(`/api/v1/documents/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
