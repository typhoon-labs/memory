import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { metadataApi } from './metadata.api';
import { metadataQueries } from './metadata.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('metadataApi', () => {
  // ── Field Groups ────────────────────────────────────────────────

  it('listFieldGroups calls correct URL', async () => {
    await metadataApi.listFieldGroups();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups');
  });

  it('getFieldGroup calls correct URL', async () => {
    await metadataApi.getFieldGroup('fg-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups/fg-1');
  });

  it('createFieldGroup uses POST method with body', async () => {
    const data = { name: 'Region', fields: [{ name: 'country', type: 'string' }] };
    await metadataApi.createFieldGroup(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('updateFieldGroup uses PATCH method with body', async () => {
    const data = { name: 'Updated Region' };
    await metadataApi.updateFieldGroup('fg-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups/fg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('deleteFieldGroup uses DELETE method', async () => {
    await metadataApi.deleteFieldGroup('fg-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups/fg-1', {
      method: 'DELETE',
    });
  });

  // ── Templates ──────────────────────────────────────────────────

  it('listTemplates calls correct URL', async () => {
    await metadataApi.listTemplates();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates');
  });

  it('getTemplate calls correct URL', async () => {
    await metadataApi.getTemplate('tpl-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates/tpl-1');
  });

  it('createTemplate uses POST method with body', async () => {
    const data = { name: 'Default', fieldGroupIds: ['fg-1'] };
    await metadataApi.createTemplate(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('updateTemplate uses PATCH method with body', async () => {
    const data = { name: 'Updated' };
    await metadataApi.updateTemplate('tpl-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates/tpl-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('deleteTemplate uses DELETE method', async () => {
    await metadataApi.deleteTemplate('tpl-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates/tpl-1', {
      method: 'DELETE',
    });
  });
});

describe('metadataQueries', () => {
  it('fieldGroups returns correct query key', () => {
    const opts = metadataQueries.fieldGroups();
    expect(opts.queryKey).toEqual(queryKeys.metadata.fieldGroups());
  });

  it('fieldGroups queryFn calls metadataApi.listFieldGroups', async () => {
    const opts = metadataQueries.fieldGroups();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups');
  });

  it('fieldGroup returns correct query key', () => {
    const opts = metadataQueries.fieldGroup('fg-1');
    expect(opts.queryKey).toEqual(queryKeys.metadata.fieldGroup('fg-1'));
  });

  it('fieldGroup is enabled when id is provided', () => {
    const opts = metadataQueries.fieldGroup('fg-1');
    expect(opts.enabled).toBe(true);
  });

  it('fieldGroup is disabled when id is empty', () => {
    const opts = metadataQueries.fieldGroup('');
    expect(opts.enabled).toBe(false);
  });

  it('fieldGroup queryFn calls metadataApi.getFieldGroup', async () => {
    const opts = metadataQueries.fieldGroup('fg-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-field-groups/fg-1');
  });

  it('templates returns correct query key', () => {
    const opts = metadataQueries.templates();
    expect(opts.queryKey).toEqual(queryKeys.metadata.templates());
  });

  it('templates queryFn calls metadataApi.listTemplates', async () => {
    const opts = metadataQueries.templates();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates');
  });

  it('template returns correct query key', () => {
    const opts = metadataQueries.template('tpl-1');
    expect(opts.queryKey).toEqual(queryKeys.metadata.template('tpl-1'));
  });

  it('template is enabled when id is provided', () => {
    const opts = metadataQueries.template('tpl-1');
    expect(opts.enabled).toBe(true);
  });

  it('template is disabled when id is empty', () => {
    const opts = metadataQueries.template('');
    expect(opts.enabled).toBe(false);
  });

  it('template queryFn calls metadataApi.getTemplate', async () => {
    const opts = metadataQueries.template('tpl-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/metadata-templates/tpl-1');
  });
});
