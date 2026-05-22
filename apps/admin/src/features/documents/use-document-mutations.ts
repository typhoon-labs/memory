import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

/** Delete a single document and its vectors. */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.all,
        predicate: (q) => q.queryKey.includes('browse'),
      });
    },
  });
}

/** Retry a failed document's ingestion pipeline. */
export function useRetryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/documents/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

/** Re-sync a ready document (re-ingest from source). */
export function useResyncDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/documents/${id}/resync`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.all,
        predicate: (q) => q.queryKey.includes('browse'),
      });
    },
  });
}

/** Bulk-delete multiple documents. */
export function useBulkDeleteDocuments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch('/api/v1/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.all,
        predicate: (q) => q.queryKey.includes('browse'),
      });
    },
  });
}

interface UpdateMetadataInput {
  id: string;
  title?: string | null;
  description?: string | null;
  customMetadata?: Record<string, unknown>;
}

/** Update a document's title, description, or custom metadata. */
export function useUpdateDocumentMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateMetadataInput) =>
      apiFetch(`/api/v1/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.documents.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

interface BulkMetadataInput {
  ids: string[];
  customMetadata: Record<string, unknown>;
  merge?: boolean;
}

/** Bulk-update custom metadata on multiple documents. */
export function useBulkUpdateMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkMetadataInput) =>
      apiFetch('/api/v1/documents/bulk-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

interface MoveDocumentInput {
  id: string;
  newSourceKey: string;
}

/** Move/rename a document (S3 sources only). */
export function useMoveDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newSourceKey }: MoveDocumentInput) =>
      apiFetch(`/api/v1/documents/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSourceKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.all,
        predicate: (q) => q.queryKey.includes('browse'),
      });
    },
  });
}
