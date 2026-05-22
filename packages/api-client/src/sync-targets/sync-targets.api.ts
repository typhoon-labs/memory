import { apiFetch } from '../client';
import type {
  BrowseEntry,
  CreateFolderInput,
  CreateSyncTargetInput,
  DeleteFolderInput,
  MoveFolderInput,
  SourceDefinition,
  SyncJob,
  SyncTarget,
  UpdateSyncTargetInput,
} from './sync-targets.types';

/** Low-level sync target API calls. */
export const syncTargetsApi = {
  /** List available source type definitions. */
  listSources: () => apiFetch<SourceDefinition[]>('/api/v1/sources'),

  /** List all sync targets. */
  list: () => apiFetch<SyncTarget[]>('/api/v1/sync-targets'),

  /** Get a single sync target by ID. */
  getById: (id: string) => apiFetch<SyncTarget>(`/api/v1/sync-targets/${id}`),

  /** Create a new sync target. */
  create: (data: CreateSyncTargetInput) =>
    apiFetch<SyncTarget>('/api/v1/sync-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a sync target. */
  update: (id: string, data: UpdateSyncTargetInput) =>
    apiFetch<SyncTarget>(`/api/v1/sync-targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a sync target. */
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/sync-targets/${id}`, {
      method: 'DELETE',
    }),

  /** Trigger a sync for a target. */
  sync: (id: string, force?: boolean) =>
    apiFetch<{ jobId: string }>(`/api/v1/sync-targets/${id}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }),

  /** Cancel a running sync. */
  cancelSync: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/sync-targets/${id}/cancel`, {
      method: 'POST',
    }),

  /** Purge all documents in a sync target. */
  purge: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/sync-targets/${id}/purge`, {
      method: 'POST',
    }),

  /** List sync jobs for a target. */
  getJobs: (id: string) => apiFetch<SyncJob[]>(`/api/v1/sync-targets/${id}/jobs`),

  /** Browse files at a prefix (S3 only). */
  browse: (id: string, path?: string) => {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    return apiFetch<BrowseEntry[]>(`/api/v1/sync-targets/${id}/browse${params}`);
  },

  /** Upload files to a sync target (S3 only). */
  upload: (id: string, formData: FormData) =>
    apiFetch<unknown[]>(`/api/v1/sync-targets/${id}/upload`, {
      method: 'POST',
      body: formData,
    }),

  /** Create a folder (S3 only). */
  createFolder: (id: string, data: CreateFolderInput) =>
    apiFetch<{ success: boolean }>(`/api/v1/sync-targets/${id}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a folder and its contents (S3 only). */
  deleteFolder: (id: string, data: DeleteFolderInput) =>
    apiFetch<{ success: boolean }>(`/api/v1/sync-targets/${id}/folders/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Move/rename a folder (S3 only). */
  moveFolder: (id: string, data: MoveFolderInput) =>
    apiFetch<{ success: boolean }>(`/api/v1/sync-targets/${id}/folders/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
