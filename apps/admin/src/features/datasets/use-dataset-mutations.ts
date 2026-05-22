import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

interface CreateDatasetInput {
  name: string;
  description?: string | null;
  [key: string]: unknown;
}

/** Create a new dataset. */
export function useCreateDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDatasetInput) =>
      apiFetch('/api/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all });
    },
  });
}

/** Update a dataset's name or description. */
export function useUpdateDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CreateDatasetInput> & { id: string }) =>
      apiFetch(`/api/v1/admin/datasets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.datasets.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all });
    },
  });
}

/** Delete a dataset and its items. */
export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/admin/datasets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all });
    },
  });
}

interface AddItemsInput {
  datasetId: string;
  items: Record<string, unknown>[];
}

/** Add items to a dataset (single or batch). */
export function useAddDatasetItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ datasetId, items }: AddItemsInput) =>
      apiFetch(`/api/v1/admin/datasets/${datasetId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      }),
    onSuccess: (_, { datasetId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.datasets.detail(datasetId),
      });
    },
  });
}

interface UpdateItemInput {
  datasetId: string;
  itemId: string;
  data: Record<string, unknown>;
}

/** Update a dataset item. */
export function useUpdateDatasetItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ datasetId, itemId, data }: UpdateItemInput) =>
      apiFetch(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { datasetId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.datasets.detail(datasetId),
      });
    },
  });
}

interface DeleteItemInput {
  datasetId: string;
  itemId: string;
}

/** Delete a dataset item. */
export function useDeleteDatasetItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ datasetId, itemId }: DeleteItemInput) =>
      apiFetch(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { datasetId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.datasets.detail(datasetId),
      });
    },
  });
}
