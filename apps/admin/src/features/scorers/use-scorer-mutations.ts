import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

interface CreateScorerInput {
  name: string;
  type: string;
  description?: string | null;
  instructions?: string | null;
  model?: Record<string, unknown> | null;
  scoreRange?: { min: number; max: number } | null;
}

/** Create a new scorer definition with an initial version. */
export function useCreateScorer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateScorerInput) =>
      apiFetch('/api/v1/admin/scorers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scorers.all });
    },
  });
}

interface UpdateScorerInput {
  id: string;
  status?: 'draft' | 'active' | 'archived';
}

/** Update a scorer definition (e.g. status). */
export function useUpdateScorer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateScorerInput) =>
      apiFetch(`/api/v1/admin/scorers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scorers.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.scorers.all });
    },
  });
}

/** Delete a scorer definition. */
export function useDeleteScorer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/admin/scorers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scorers.all });
    },
  });
}

interface CreateVersionInput {
  scorerId: string;
  name: string;
  type: string;
  description?: string | null;
  instructions?: string | null;
  model?: Record<string, unknown> | null;
  scoreRange?: { min: number; max: number } | null;
  changeMessage?: string | null;
}

/** Create a new version of a scorer. */
export function useCreateScorerVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scorerId, ...data }: CreateVersionInput) =>
      apiFetch(`/api/v1/admin/scorers/${scorerId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { scorerId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scorers.detail(scorerId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.scorers.all });
    },
  });
}

interface PublishVersionInput {
  scorerId: string;
  versionId?: string;
}

/** Publish a scorer version (set it as active). */
export function usePublishScorerVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scorerId, versionId }: PublishVersionInput) =>
      apiFetch(`/api/v1/admin/scorers/${scorerId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(versionId ? { versionId } : {}),
      }),
    onSuccess: (_, { scorerId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scorers.detail(scorerId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.scorers.all });
    },
  });
}

interface PreviewScoreInput {
  scorerId: string;
  question: string;
  response: string;
  context: string[];
}

interface PreviewScoreResult {
  score: number;
  reason: string | null;
  durationMs: number;
}

/** Preview-score a sample with a scorer. */
export function usePreviewScore() {
  return useMutation({
    mutationFn: ({ scorerId, ...data }: PreviewScoreInput) =>
      apiFetch<PreviewScoreResult>(`/api/v1/admin/scorers/${scorerId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  });
}
