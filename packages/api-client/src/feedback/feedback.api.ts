import { apiFetch } from '../client';
import type { FeedbackEntry, UpsertFeedbackInput, UpsertFeedbackResponse } from './feedback.types';

/** Low-level feedback API calls. */
export const feedbackApi = {
  /** Create, update, or delete feedback for a message. */
  upsert: (data: UpsertFeedbackInput) =>
    apiFetch<UpsertFeedbackResponse>('/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** List feedback entries for a specific thread (scoped to current user). */
  listByThread: (threadId: string) =>
    apiFetch<FeedbackEntry[]>(`/api/v1/feedback?threadId=${encodeURIComponent(threadId)}`),

  /** List all feedback entries (admin). */
  listAll: () => apiFetch<FeedbackEntry[]>('/api/v1/feedback'),
};
