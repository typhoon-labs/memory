import { apiFetch } from '../client';
import type { CreateThreadInput, ThreadDetail, ThreadListResponse, UpdateThreadInput } from './threads.types';

/** Low-level thread API calls. */
export const threadsApi = {
  /** List threads for the authenticated user. */
  list: (params?: { page?: number; perPage?: number }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    const qs = search.toString();
    return apiFetch<ThreadListResponse>(`/api/v1/threads${qs ? `?${qs}` : ''}`);
  },

  /** Get a single thread with its messages. */
  getById: (threadId: string) => apiFetch<ThreadDetail>(`/api/v1/threads/${threadId}`),

  /** Create a new thread. */
  create: (data: CreateThreadInput) =>
    apiFetch<ThreadDetail>('/api/v1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a thread. */
  update: (threadId: string, data: UpdateThreadInput) =>
    apiFetch<ThreadDetail>(`/api/v1/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a thread and its messages. */
  delete: (threadId: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/threads/${threadId}`, {
      method: 'DELETE',
    }),
};
