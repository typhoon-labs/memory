import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries })),
}));

vi.mock('@typhoon/ui', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return { queryKeys: actual.queryKeys };
});

import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

import {
  useCreateFieldGroup,
  useCreateTemplate,
  useDeleteFieldGroup,
  useDeleteTemplate,
  useUpdateFieldGroup,
  useUpdateTemplate,
} from './use-metadata-mutations';

// ── Field Group mutations ─────────────────────────────────────

describe('useCreateFieldGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and field group data', async () => {
    const config = useCreateFieldGroup() as unknown as {
      mutationFn: (data: { name: string; fields: Record<string, unknown> }) => Promise<unknown>;
    };
    const input = { name: 'Region', fields: { country: { type: 'string' } } };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates fieldGroups on success', () => {
    const config = useCreateFieldGroup() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.fieldGroups(),
    });
  });
});

describe('useUpdateFieldGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH for a specific field group', async () => {
    const config = useUpdateFieldGroup() as unknown as {
      mutationFn: (data: { id: string; name?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'fg-1', name: 'Updated Region' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups/fg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Region' }),
    });
  });

  it('invalidates fieldGroup detail, fieldGroups list, and templates on success', () => {
    const config = useUpdateFieldGroup() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'fg-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.fieldGroup('fg-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.fieldGroups(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.templates(),
    });
  });
});

describe('useDeleteFieldGroup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteFieldGroup() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('fg-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups/fg-1', {
      method: 'DELETE',
    });
  });

  it('invalidates fieldGroups and templates on success', () => {
    const config = useDeleteFieldGroup() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.fieldGroups(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.templates(),
    });
  });
});

// ── Template mutations ────────────────────────────────────────

describe('useCreateTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and template data', async () => {
    const config = useCreateTemplate() as unknown as {
      mutationFn: (data: { name: string }) => Promise<unknown>;
    };
    const input = { name: 'Default Template' };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates templates on success', () => {
    const config = useCreateTemplate() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.templates(),
    });
  });
});

describe('useUpdateTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH for a specific template', async () => {
    const config = useUpdateTemplate() as unknown as {
      mutationFn: (data: { id: string; name?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'tmpl-1', name: 'Renamed' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates/tmpl-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
  });

  it('invalidates template detail and templates list on success', () => {
    const config = useUpdateTemplate() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'tmpl-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.template('tmpl-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.templates(),
    });
  });
});

describe('useDeleteTemplate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteTemplate() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('tmpl-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates/tmpl-1', {
      method: 'DELETE',
    });
  });

  it('invalidates templates on success', () => {
    const config = useDeleteTemplate() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.metadata.templates(),
    });
  });
});
