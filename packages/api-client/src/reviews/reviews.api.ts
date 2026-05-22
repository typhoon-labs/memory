import { apiFetch } from '../client';
import type { AnnotationInput, ReviewAnnotation, ReviewDetail, ReviewThread } from './reviews.types';

/** Low-level review API calls. */
export const reviewsApi = {
  /** List threads with aggregate score data (admin). */
  list: (filters?: { sortBy?: string; annotationStatus?: string }) => {
    const params = new URLSearchParams();
    if (filters?.sortBy) params.set('sortBy', filters.sortBy);
    if (filters?.annotationStatus) params.set('annotationStatus', filters.annotationStatus);
    const qs = params.toString();
    return apiFetch<ReviewThread[]>(`/api/v1/admin/reviews${qs ? `?${qs}` : ''}`);
  },

  /** Get thread detail with messages, scores, and annotations. */
  getDetail: (threadId: string) => apiFetch<ReviewDetail>(`/api/v1/admin/reviews/${threadId}`),

  /** Create a human annotation on a message. */
  createAnnotation: (threadId: string, messageId: string, data: AnnotationInput) =>
    apiFetch<ReviewAnnotation>(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update an existing annotation. */
  updateAnnotation: (threadId: string, messageId: string, data: AnnotationInput) =>
    apiFetch<ReviewAnnotation>(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete an annotation. */
  deleteAnnotation: (threadId: string, messageId: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/admin/reviews/${threadId}/messages/${messageId}/annotate`, {
      method: 'DELETE',
    }),
};
