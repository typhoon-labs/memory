import { apiFetch } from '../client';
import type { TraceDetail, TraceListParams, TraceListResponse } from './traces.types';

/** Low-level trace API calls. */
export const tracesApi = {
  /** List traces with optional filters. */
  list: (params?: TraceListParams) => {
    const search = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) search.set(key, String(value));
      }
    }
    const qs = search.toString();
    return apiFetch<TraceListResponse>(`/api/v1/admin/traces${qs ? `?${qs}` : ''}`);
  },

  /** Get trace detail with all spans. */
  getDetail: (traceId: string) => apiFetch<TraceDetail>(`/api/v1/admin/traces/${traceId}`),
};
