import { apiFetch } from '../client';
import type {
  CreateScorerInput,
  CreateScorerVersionInput,
  PreviewScoreInput,
  PreviewScoreResult,
  PublishVersionInput,
  Scorer,
  ScorerListResponse,
  ScorerModel,
  ScorerVersion,
  ScorerVersionListResponse,
  UpdateScorerInput,
} from './scorers.types';

/** Low-level scorer API calls. */
export const scorersApi = {
  /** List scorer definitions with active version info. */
  list: (params?: { page?: number; perPage?: number; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    if (params?.status) search.set('status', params.status);
    const qs = search.toString();
    return apiFetch<ScorerListResponse>(`/api/v1/admin/scorers${qs ? `?${qs}` : ''}`);
  },

  /** Get a single scorer with its active version. */
  getById: (id: string) => apiFetch<Scorer>(`/api/v1/admin/scorers/${id}`),

  /** Create a new scorer definition + initial version. */
  create: (data: CreateScorerInput) =>
    apiFetch<Scorer>('/api/v1/admin/scorers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a scorer definition (name, description, status). */
  update: (id: string, data: UpdateScorerInput) =>
    apiFetch<Scorer>(`/api/v1/admin/scorers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a scorer definition. */
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/admin/scorers/${id}`, {
      method: 'DELETE',
    }),

  /** List version history for a scorer. */
  listVersions: (id: string, params?: { page?: number; perPage?: number }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    const qs = search.toString();
    return apiFetch<ScorerVersionListResponse>(`/api/v1/admin/scorers/${id}/versions${qs ? `?${qs}` : ''}`);
  },

  /** Create a new version for a scorer. */
  createVersion: (id: string, data: CreateScorerVersionInput) =>
    apiFetch<ScorerVersion>(`/api/v1/admin/scorers/${id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Publish a version (set as active). */
  publishVersion: (id: string, data?: PublishVersionInput) =>
    apiFetch<Scorer>(`/api/v1/admin/scorers/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data ?? {}),
    }),

  /** Preview — test a scorer against sample data. */
  previewScore: (id: string, data: PreviewScoreInput) =>
    apiFetch<PreviewScoreResult>(`/api/v1/admin/scorers/${id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Get available models for scorer selection. */
  getModels: () => apiFetch<ScorerModel[]>('/api/v1/admin/scorers/models'),
};
