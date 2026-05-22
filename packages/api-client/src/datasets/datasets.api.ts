import { apiFetch } from '../client';
import type {
  AddDatasetItemsInput,
  CreateDatasetInput,
  Dataset,
  DatasetItemListResponse,
  DatasetListResponse,
  UpdateDatasetInput,
  UpdateDatasetItemInput,
} from './datasets.types';

/** Low-level dataset API calls. */
export const datasetsApi = {
  /** List datasets. */
  list: (params?: { page?: number; perPage?: number }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    const qs = search.toString();
    return apiFetch<DatasetListResponse>(`/api/v1/admin/datasets${qs ? `?${qs}` : ''}`);
  },

  /** Get a single dataset by ID. */
  getById: (id: string) => apiFetch<Dataset>(`/api/v1/admin/datasets/${id}`),

  /** Create a new dataset. */
  create: (data: CreateDatasetInput) =>
    apiFetch<Dataset>('/api/v1/admin/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a dataset. */
  update: (id: string, data: UpdateDatasetInput) =>
    apiFetch<Dataset>(`/api/v1/admin/datasets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a dataset. */
  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/admin/datasets/${id}`, {
      method: 'DELETE',
    }),

  /** List items in a dataset. */
  listItems: (id: string, params?: { page?: number; perPage?: number }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.perPage !== undefined) search.set('perPage', String(params.perPage));
    const qs = search.toString();
    return apiFetch<DatasetItemListResponse>(`/api/v1/admin/datasets/${id}/items${qs ? `?${qs}` : ''}`);
  },

  /** Add items to a dataset (single or batch). */
  addItems: (id: string, data: AddDatasetItemsInput) =>
    apiFetch<{ added: number }>(`/api/v1/admin/datasets/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a single dataset item. */
  updateItem: (datasetId: string, itemId: string, data: UpdateDatasetItemInput) =>
    apiFetch<DatasetItemListResponse['items'][number]>(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a single dataset item. */
  deleteItem: (datasetId: string, itemId: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/admin/datasets/${datasetId}/items/${itemId}`, {
      method: 'DELETE',
    }),
};
