import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { syncTargetsApi } from './sync-targets.api';
import { syncTargetsQueries } from './sync-targets.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncTargetsApi', () => {
  it('listSources calls correct URL', async () => {
    await syncTargetsApi.listSources();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sources');
  });

  it('list calls correct URL', async () => {
    await syncTargetsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets');
  });

  it('getById calls correct URL', async () => {
    await syncTargetsApi.getById('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1');
  });

  it('create uses POST method with body', async () => {
    const data = { name: 'Docs', sourceType: 's3', config: {} };
    await syncTargetsApi.create(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('update uses PATCH method with body', async () => {
    const data = { name: 'Updated Docs' };
    await syncTargetsApi.update('st-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('delete uses DELETE method', async () => {
    await syncTargetsApi.delete('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1', {
      method: 'DELETE',
    });
  });

  it('sync uses POST method with force flag', async () => {
    await syncTargetsApi.sync('st-1', true);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
  });

  it('sync without force flag', async () => {
    await syncTargetsApi.sync('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: undefined }),
    });
  });

  it('cancelSync uses POST method', async () => {
    await syncTargetsApi.cancelSync('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/cancel', {
      method: 'POST',
    });
  });

  it('purge uses POST method', async () => {
    await syncTargetsApi.purge('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/purge', {
      method: 'POST',
    });
  });

  it('getJobs calls correct URL', async () => {
    await syncTargetsApi.getJobs('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/jobs');
  });

  it('browse calls correct URL without path', async () => {
    await syncTargetsApi.browse('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/browse');
  });

  it('browse includes encoded path param', async () => {
    await syncTargetsApi.browse('st-1', '/docs/sub folder');
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/sync-targets/st-1/browse?path=${encodeURIComponent('/docs/sub folder')}`,
    );
  });

  it('upload uses POST method with FormData', async () => {
    const formData = new FormData();
    await syncTargetsApi.upload('st-1', formData);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/upload', {
      method: 'POST',
      body: formData,
    });
  });

  it('createFolder uses POST method with body', async () => {
    const data = { path: '/docs/new-folder' };
    await syncTargetsApi.createFolder('st-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('deleteFolder uses POST method with body', async () => {
    const data = { path: '/docs/old-folder' };
    await syncTargetsApi.deleteFolder('st-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/folders/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('moveFolder uses POST method with body', async () => {
    const data = { from: '/old', to: '/new' };
    await syncTargetsApi.moveFolder('st-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/folders/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });
});

describe('syncTargetsQueries', () => {
  it('list returns correct query key', () => {
    const opts = syncTargetsQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.syncTargets.list());
  });

  it('list queryFn calls syncTargetsApi.list', async () => {
    const opts = syncTargetsQueries.list();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets');
  });

  it('detail returns correct query key', () => {
    const opts = syncTargetsQueries.detail('st-1');
    expect(opts.queryKey).toEqual(queryKeys.syncTargets.detail('st-1'));
  });

  it('detail is enabled when id is provided', () => {
    const opts = syncTargetsQueries.detail('st-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when id is empty', () => {
    const opts = syncTargetsQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls syncTargetsApi.getById', async () => {
    const opts = syncTargetsQueries.detail('st-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1');
  });

  it('jobs returns correct query key', () => {
    const opts = syncTargetsQueries.jobs('st-1');
    expect(opts.queryKey).toEqual(queryKeys.syncTargets.jobs('st-1'));
  });

  it('jobs is enabled when id is provided', () => {
    const opts = syncTargetsQueries.jobs('st-1');
    expect(opts.enabled).toBe(true);
  });

  it('jobs is disabled when id is empty', () => {
    const opts = syncTargetsQueries.jobs('');
    expect(opts.enabled).toBe(false);
  });

  it('jobs queryFn calls syncTargetsApi.getJobs', async () => {
    const opts = syncTargetsQueries.jobs('st-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/jobs');
  });

  it('browse returns correct query key', () => {
    const opts = syncTargetsQueries.browse('st-1', '/docs');
    expect(opts.queryKey).toEqual(queryKeys.syncTargets.browse('st-1', '/docs'));
  });

  it('browse is enabled when id is provided', () => {
    const opts = syncTargetsQueries.browse('st-1');
    expect(opts.enabled).toBe(true);
  });

  it('browse is disabled when id is empty', () => {
    const opts = syncTargetsQueries.browse('');
    expect(opts.enabled).toBe(false);
  });

  it('browse queryFn calls syncTargetsApi.browse', async () => {
    const opts = syncTargetsQueries.browse('st-1', '/docs');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/sync-targets/st-1/browse');
    expect(url).toContain(`path=${encodeURIComponent('/docs')}`);
  });
});
