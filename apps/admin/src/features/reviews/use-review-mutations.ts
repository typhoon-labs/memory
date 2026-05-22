import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

type AnnotationTag = 'wrong-answer' | 'hallucination' | 'incomplete' | 'wrong-source-cited' | 'tone-issue' | 'correct';

type Severity = 'minor' | 'major' | 'critical';

interface AnnotationInput {
  threadId: string;
  messageId: string;
  tags: AnnotationTag[];
  severity?: Severity;
  comment?: string;
}

/** Create a human annotation on a message. */
export function useCreateAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, messageId, ...data }: AnnotationInput) =>
      apiFetch(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.detail(threadId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}

interface UpdateAnnotationInput {
  threadId: string;
  messageId: string;
  tags: AnnotationTag[];
  severity?: Severity;
  comment?: string;
}

/** Update an existing annotation on a message. */
export function useUpdateAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, messageId, ...data }: UpdateAnnotationInput) =>
      apiFetch(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.detail(threadId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}

interface DeleteAnnotationInput {
  threadId: string;
  messageId: string;
}

/** Delete an annotation from a message. */
export function useDeleteAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, messageId }: DeleteAnnotationInput) =>
      apiFetch(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, { method: 'DELETE' }),
    onSuccess: (_, { threadId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.detail(threadId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}
