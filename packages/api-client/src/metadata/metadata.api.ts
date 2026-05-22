import { apiFetch } from '../client';
import type {
  CreateFieldGroupInput,
  CreateTemplateInput,
  MetadataFieldGroup,
  MetadataTemplate,
  UpdateFieldGroupInput,
  UpdateTemplateInput,
} from './metadata.types';

/** Low-level metadata field group & template API calls. */
export const metadataApi = {
  // ── Field Groups ───────────────────────────────────────────────

  /** List all field groups. */
  listFieldGroups: () => apiFetch<MetadataFieldGroup[]>('/api/v1/metadata-field-groups'),

  /** Get a single field group by ID. */
  getFieldGroup: (id: string) => apiFetch<MetadataFieldGroup>(`/api/v1/metadata-field-groups/${id}`),

  /** Create a new field group. */
  createFieldGroup: (data: CreateFieldGroupInput) =>
    apiFetch<MetadataFieldGroup>('/api/v1/metadata-field-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a field group. */
  updateFieldGroup: (id: string, data: UpdateFieldGroupInput) =>
    apiFetch<MetadataFieldGroup>(`/api/v1/metadata-field-groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a field group. */
  deleteFieldGroup: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/metadata-field-groups/${id}`, {
      method: 'DELETE',
    }),

  // ── Templates ──────────────────────────────────────────────────

  /** List all metadata templates. */
  listTemplates: () => apiFetch<MetadataTemplate[]>('/api/v1/metadata-templates'),

  /** Get a single template by ID. */
  getTemplate: (id: string) => apiFetch<MetadataTemplate>(`/api/v1/metadata-templates/${id}`),

  /** Create a new template. */
  createTemplate: (data: CreateTemplateInput) =>
    apiFetch<MetadataTemplate>('/api/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Update a template. */
  updateTemplate: (id: string, data: UpdateTemplateInput) =>
    apiFetch<MetadataTemplate>(`/api/v1/metadata-templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  /** Delete a template. */
  deleteTemplate: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/metadata-templates/${id}`, {
      method: 'DELETE',
    }),
};
