import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FeedbackEntry, feedbackApi, queryKeys, type UpsertFeedbackInput } from '@typhoon/api-client';
import { useCallback } from 'react';

/**
 * Upsert (create/update/delete) feedback for a message with optimistic
 * updates. Mirrors the pattern from the existing `use-feedback.ts` hook
 * but uses the centralized api-client and query keys.
 */
export function useUpsertFeedback(threadId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = threadId ? queryKeys.feedback.byThread(threadId) : queryKeys.feedback.all;

  const mutation = useMutation({
    mutationFn: (data: UpsertFeedbackInput) => feedbackApi.upsert(data),
    onMutate: async ({ messageId, rating, comment }) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous
      const previous = queryClient.getQueryData<FeedbackEntry[]>(queryKey);

      // Optimistic update
      queryClient.setQueryData<FeedbackEntry[]>(queryKey, (old = []) => {
        const filtered = old.filter((e) => e.messageId !== messageId);
        if (rating) {
          filtered.push({
            id: 'optimistic',
            messageId,
            rating,
            comment: comment ?? null,
            createdAt: new Date().toISOString(),
          });
        }
        return filtered;
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleFeedback = useCallback(
    (messageId: string, rating: 'positive' | 'negative' | null, comment?: string) => {
      mutation.mutate({ messageId, rating, comment });
    },
    [mutation],
  );

  return { handleFeedback, mutation };
}
