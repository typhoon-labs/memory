import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

interface CreateSyncTargetInput {
  name: string;
  sourceType: string;
  config: Record<string, unknown>;
  cronSchedule?: string;
  isActive?: boolean;
  source?: string;
  metadataTemplateId?: string | null;
  autoExtractMetadata?: boolean;
}

/** Create a new sync target. */
export function useCreateSyncTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSyncTargetInput) =>
      apiFetch('/api/v1/sync-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.syncTargets.all });
    },
  });
}

/** Update an existing sync target. */
export function useUpdateSyncTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateSyncTargetInput> & { id: string }) =>
      apiFetch(`/api/v1/sync-targets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.syncTargets.all });
    },
  });
}

/** Delete a sync target and all its documents. */
export function useDeleteSyncTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/sync-targets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.syncTargets.all });
    },
  });
}

/** Trigger a sync job on a target. */
export function useSyncTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      apiFetch(`/api/v1/sync-targets/${id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: !!force }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.jobs(id),
      });
    },
  });
}

interface UploadInput {
  id: string;
  files: File[];
  path?: string;
}

/** Upload files to an S3 sync target. */
export function useUploadFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, files, path }: UploadInput) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      if (path) {
        formData.append('path', path);
      }
      return apiFetch(`/api/v1/sync-targets/${id}/upload`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: ['sync-targets', 'browse', id],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
    },
  });
}

/** Delete a source (purge all documents and vectors). */
export function usePurgeSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/sync-targets/${id}/purge`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.syncTargets.jobs(id),
      });
    },
  });
}
