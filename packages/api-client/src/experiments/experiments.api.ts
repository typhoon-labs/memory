import { apiFetch } from '../client';
import type {
  CreateExperimentInput,
  Experiment,
  ExperimentComparison,
  ExperimentListResponse,
  ExperimentResultsResponse,
} from './experiments.types';

/** Low-level experiment API calls. */
export const experimentsApi = {
  /** List experiments with optional filters. */
  list: (params?: { page?: number; perPage?: number; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    if (params?.status) search.set('status', params.status);
    const qs = search.toString();
    return apiFetch<ExperimentListResponse>(`/api/v1/admin/experiments${qs ? `?${qs}` : ''}`);
  },

  /** Get a single experiment by ID. */
  getById: (id: string) => apiFetch<Experiment>(`/api/v1/admin/experiments/${id}`),

  /** Create an experiment and enqueue the job. */
  create: (data: CreateExperimentInput) =>
    apiFetch<Experiment>('/api/v1/admin/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete (cancel) an experiment. */
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/admin/experiments/${id}`, {
      method: 'DELETE',
    }),

  /** Get experiment results. */
  getResults: (id: string, params?: { page?: number; perPage?: number }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    const qs = search.toString();
    return apiFetch<ExperimentResultsResponse>(`/api/v1/admin/experiments/${id}/results${qs ? `?${qs}` : ''}`);
  },

  /** Compare two experiments. */
  compare: (idA: string, idB: string) =>
    apiFetch<ExperimentComparison>(
      `/api/v1/admin/experiments/compare?a=${encodeURIComponent(idA)}&b=${encodeURIComponent(idB)}`,
    ),
};
