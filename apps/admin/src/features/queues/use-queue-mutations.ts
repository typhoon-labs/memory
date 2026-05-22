import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

interface RetryJobInput {
  queueName: string;
  jobId: string;
}

/** Retry a failed job. */
export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ queueName, jobId }: RetryJobInput) =>
      apiFetch(`/api/v1/queues/${queueName}/jobs/${jobId}/retry`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    },
  });
}

interface RemoveJobInput {
  queueName: string;
  jobId: string;
}

/** Remove a job from the queue. */
export function useRemoveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ queueName, jobId }: RemoveJobInput) =>
      apiFetch(`/api/v1/queues/${queueName}/jobs/${jobId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    },
  });
}

/** Pause a queue. */
export function usePauseQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (queueName: string) => apiFetch(`/api/v1/queues/${queueName}/pause`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    },
  });
}

/** Resume a paused queue. */
export function useResumeQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (queueName: string) => apiFetch(`/api/v1/queues/${queueName}/resume`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    },
  });
}

interface CleanQueueInput {
  queueName: string;
  state: 'completed' | 'failed' | 'delayed' | 'wait';
  grace?: number;
  limit?: number;
}

/** Clean old jobs from a queue by state. */
export function useCleanQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ queueName, ...data }: CleanQueueInput) =>
      apiFetch(`/api/v1/queues/${queueName}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grace: 0, limit: 1000, ...data }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
    },
  });
}
