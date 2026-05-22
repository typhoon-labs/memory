import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

// ── Field Group mutations ─────────────────────────────────────

interface CreateFieldGroupInput {
  name: string;
  fields: Record<string, unknown>;
  [key: string]: unknown;
}

/** Create a new metadata field group. */
export function useCreateFieldGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFieldGroupInput) =>
      apiFetch('/api/v1/metadata-field-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.fieldGroups(),
      });
    },
  });
}

interface UpdateFieldGroupInput {
  id: string;
  name?: string;
  fields?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Update an existing metadata field group. */
export function useUpdateFieldGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateFieldGroupInput) =>
      apiFetch(`/api/v1/metadata-field-groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.fieldGroup(id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.fieldGroups(),
      });
      // Templates that reference this group may have changed effective schemas
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.templates(),
      });
    },
  });
}

/** Delete a metadata field group. */
export function useDeleteFieldGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/metadata-field-groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.fieldGroups(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.templates(),
      });
    },
  });
}

// ── Template mutations ────────────────────────────────────────

interface CreateTemplateInput {
  name: string;
  fieldGroupIds?: string[];
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Create a new metadata template. */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateInput) =>
      apiFetch('/api/v1/metadata-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.templates(),
      });
    },
  });
}

interface UpdateTemplateInput {
  id: string;
  name?: string;
  fieldGroupIds?: string[];
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Update an existing metadata template. */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateTemplateInput) =>
      apiFetch(`/api/v1/metadata-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.template(id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.templates(),
      });
    },
  });
}

/** Delete a metadata template. */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/metadata-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.metadata.templates(),
      });
    },
  });
}
