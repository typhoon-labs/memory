import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

/** Delete a thread and all its messages. */
export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => apiFetch(`/api/v1/threads/${threadId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
    },
  });
}
