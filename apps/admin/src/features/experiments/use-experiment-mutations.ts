import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

interface CreateExperimentInput {
  name?: string;
  datasetId: string;
  scorerIds?: string[];
  [key: string]: unknown;
}

/** Create a new experiment and enqueue the evaluation job. */
export function useCreateExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExperimentInput) =>
      apiFetch('/api/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.experiments.all });
    },
  });
}

/** Delete an experiment and all its results. */
export function useDeleteExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/admin/experiments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.experiments.all });
    },
  });
}
