import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { scorersApi } from './scorers.api';
import { scorersQueries } from './scorers.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scorersApi', () => {
  it('list calls correct URL without params', async () => {
    await scorersApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers');
  });

  it('list includes pagination and status params', async () => {
    await scorersApi.list({ page: 1, perPage: 10, status: 'active' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('page=1');
    expect(url).toContain('perPage=10');
    expect(url).toContain('status=active');
  });

  it('getById calls correct URL', async () => {
    await scorersApi.getById('s-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1');
  });

  it('create uses POST method with body', async () => {
    const data = { name: 'Quality', type: 'llm' };
    await scorersApi.create(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('update uses PATCH method with body', async () => {
    const data = { name: 'Updated Quality' };
    await scorersApi.update('s-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('delete uses DELETE method', async () => {
    await scorersApi.delete('s-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1', {
      method: 'DELETE',
    });
  });

  it('listVersions calls correct URL without params', async () => {
    await scorersApi.listVersions('s-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1/versions');
  });

  it('listVersions includes pagination params', async () => {
    await scorersApi.listVersions('s-1', { page: 2, perPage: 5 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/scorers/s-1/versions?');
    expect(url).toContain('page=2');
    expect(url).toContain('perPage=5');
  });

  it('createVersion uses POST method with body', async () => {
    const data = { prompt: 'Rate quality from 1-5' };
    await scorersApi.createVersion('s-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('publishVersion uses POST method with body', async () => {
    const data = { versionId: 'v-2' };
    await scorersApi.publishVersion('s-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('publishVersion without data sends empty body', async () => {
    await scorersApi.publishVersion('s-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('previewScore uses POST method with body', async () => {
    const data = { input: 'test', output: 'response' };
    await scorersApi.previewScore('s-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('getModels calls correct URL', async () => {
    await scorersApi.getModels();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/models');
  });
});

describe('scorersQueries', () => {
  it('list returns correct query key', () => {
    const opts = scorersQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.scorers.list());
  });

  it('list queryFn calls scorersApi.list', async () => {
    const opts = scorersQueries.list();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/admin/scorers');
  });

  it('detail returns correct query key', () => {
    const opts = scorersQueries.detail('s-1');
    expect(opts.queryKey).toEqual(queryKeys.scorers.detail('s-1'));
  });

  it('detail is enabled when id is provided', () => {
    const opts = scorersQueries.detail('s-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when id is empty', () => {
    const opts = scorersQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls scorersApi.getById', async () => {
    const opts = scorersQueries.detail('s-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/s-1');
  });

  it('categories returns correct query key', () => {
    const opts = scorersQueries.categories();
    expect(opts.queryKey).toEqual(queryKeys.scorers.categories());
  });

  it('categories queryFn calls scorersApi.getModels', async () => {
    const opts = scorersQueries.categories();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/models');
  });
});
