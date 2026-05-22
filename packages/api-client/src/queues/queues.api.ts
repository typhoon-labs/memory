import { apiFetch } from '../client';
import type {
  CleanQueueInput,
  FailedJob,
  FailedJobListResponse,
  Queue,
  QueueJob,
  QueueJobListResponse,
  QueueWorker,
} from './queues.types';

/** Low-level queue API calls. */
export const queuesApi = {
  /** List all queues with job counts. */
  list: () => apiFetch<Queue[]>('/api/v1/queues'),

  /** List workers connected to a queue. */
  listWorkers: (name: string) => apiFetch<QueueWorker[]>(`/api/v1/queues/${encodeURIComponent(name)}/workers`),

  /** List jobs in a queue by state. */
  listJobs: (name: string, params?: { state?: string; start?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    if (params?.state) search.set('state', params.state);
    if (params?.start !== undefined) search.set('start', String(params.start));
    if (params?.pageSize !== undefined) search.set('pageSize', String(params.pageSize));
    const qs = search.toString();
    return apiFetch<QueueJobListResponse>(`/api/v1/queues/${encodeURIComponent(name)}/jobs${qs ? `?${qs}` : ''}`);
  },

  /** Pause a queue. */
  pauseQueue: (name: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/queues/${encodeURIComponent(name)}/pause`, {
      method: 'POST',
    }),

  /** Resume a queue. */
  resumeQueue: (name: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/queues/${encodeURIComponent(name)}/resume`, {
      method: 'POST',
    }),

  /** Clean old jobs from a queue. */
  cleanQueue: (name: string, data: CleanQueueInput) =>
    apiFetch<{ removed: number }>(`/api/v1/queues/${encodeURIComponent(name)}/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Retry a failed job. */
  retryJob: (name: string, jobId: string) =>
    apiFetch<QueueJob>(`/api/v1/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
    }),

  /** Remove a job from a queue. */
  removeJob: (name: string, jobId: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    }),

  /** List failed job archive entries. */
  listFailedJobs: (params?: { limit?: number; offset?: number; queue?: string }) => {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.offset !== undefined) search.set('offset', String(params.offset));
    if (params?.queue) search.set('queue', params.queue);
    const qs = search.toString();
    return apiFetch<FailedJobListResponse>(`/api/v1/queues/failed-jobs${qs ? `?${qs}` : ''}`);
  },

  /** Get a single failed job archive entry. */
  getFailedJob: (id: string) => apiFetch<FailedJob>(`/api/v1/queues/failed-jobs/${id}`),

  /** Delete a failed job archive entry. */
  deleteFailedJob: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/queues/failed-jobs/${id}`, {
      method: 'DELETE',
    }),
};
