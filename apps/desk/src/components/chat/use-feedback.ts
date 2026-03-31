import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

interface FeedbackEntry {
  id: string;
  messageId: string;
  rating: 'positive' | 'negative';
  comment?: string;
}

export function useFeedback(threadId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: entries } = useQuery<FeedbackEntry[]>({
    queryKey: ['feedback', threadId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/feedback?threadId=${threadId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!threadId,
  });

  const feedbackState = useMemo(() => {
    const map = new Map<string, { rating: 'positive' | 'negative'; comment?: string }>();
    if (entries) {
      for (const e of entries) {
        map.set(e.messageId, { rating: e.rating, comment: e.comment });
      }
    }
    return map;
  }, [entries]);

  const mutation = useMutation({
    mutationFn: async ({
      messageId,
      rating,
      comment,
    }: {
      messageId: string;
      rating: 'positive' | 'negative' | null;
      comment?: string;
    }) => {
      const res = await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageId, rating, comment }),
      });
      if (!res.ok) throw new Error('Failed to submit feedback');
      return res.json();
    },
    onMutate: async ({ messageId, rating, comment }) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: ['feedback', threadId] });

      // Snapshot previous
      const previous = queryClient.getQueryData<FeedbackEntry[]>(['feedback', threadId]);

      // Optimistic update
      queryClient.setQueryData<FeedbackEntry[]>(['feedback', threadId], (old = []) => {
        const filtered = old.filter((e) => e.messageId !== messageId);
        if (rating) {
          filtered.push({ id: 'optimistic', messageId, rating, comment });
        }
        return filtered;
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      console.error('Feedback submission failed:', _err);
      if (context?.previous) {
        queryClient.setQueryData(['feedback', threadId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback', threadId] });
    },
  });

  const handleFeedback = useCallback(
    (messageId: string, rating: 'positive' | 'negative' | null, comment?: string) => {
      mutation.mutate({ messageId, rating, comment });
    },
    [mutation],
  );

  return { feedbackState, handleFeedback };
}
