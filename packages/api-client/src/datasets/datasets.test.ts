import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { datasetsApi } from './datasets.api';
import { datasetsQueries } from './datasets.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('datasetsApi', () => {
  it('list calls correct URL without params', async () => {
    await datasetsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets');
  });

  it('list includes pagination params', async () => {
    await datasetsApi.list({ page: 2, perPage: 10 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('perPage=10');
  });

  it('getById calls correct URL', async () => {
    await datasetsApi.getById('ds-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1');
  });

  it('create uses POST method with body', async () => {
    const data = { name: 'Test Dataset', description: 'desc' };
    await datasetsApi.create(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('update uses PATCH method with body', async () => {
    const data = { name: 'Updated' };
    await datasetsApi.update('ds-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('delete uses DELETE method', async () => {
    await datasetsApi.delete('ds-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1', {
      method: 'DELETE',
    });
  });

  it('listItems calls correct URL', async () => {
    await datasetsApi.listItems('ds-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items');
  });

  it('listItems includes pagination params', async () => {
    await datasetsApi.listItems('ds-1', { page: 3, perPage: 25 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/datasets/ds-1/items?');
    expect(url).toContain('page=3');
    expect(url).toContain('perPage=25');
  });

  it('addItems uses POST method', async () => {
    const data = { items: [{ input: 'q', expectedOutput: 'a' }] };
    await datasetsApi.addItems('ds-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('updateItem uses PATCH method', async () => {
    const data = { input: 'updated' };
    await datasetsApi.updateItem('ds-1', 'item-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items/item-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('deleteItem uses DELETE method', async () => {
    await datasetsApi.deleteItem('ds-1', 'item-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items/item-1', {
      method: 'DELETE',
    });
  });
});

describe('datasetsQueries', () => {
  it('list returns correct query key', () => {
    const opts = datasetsQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.datasets.list());
  });

  it('list queryFn calls datasetsApi.list', async () => {
    const opts = datasetsQueries.list();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/admin/datasets');
  });

  it('detail returns correct query key', () => {
    const opts = datasetsQueries.detail('ds-1');
    expect(opts.queryKey).toEqual(queryKeys.datasets.detail('ds-1'));
  });

  it('detail is enabled when id is provided', () => {
    const opts = datasetsQueries.detail('ds-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when id is empty', () => {
    const opts = datasetsQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls datasetsApi.getById', async () => {
    const opts = datasetsQueries.detail('ds-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1');
  });

  it('items returns correct query key', () => {
    const opts = datasetsQueries.items('ds-1', 2);
    expect(opts.queryKey).toEqual(queryKeys.datasets.items('ds-1', 2));
  });

  it('items is enabled when id is provided', () => {
    const opts = datasetsQueries.items('ds-1');
    expect(opts.enabled).toBe(true);
  });

  it('items is disabled when id is empty', () => {
    const opts = datasetsQueries.items('');
    expect(opts.enabled).toBe(false);
  });

  it('items queryFn calls datasetsApi.listItems', async () => {
    const opts = datasetsQueries.items('ds-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/v1/admin/datasets/ds-1/items');
  });
});
