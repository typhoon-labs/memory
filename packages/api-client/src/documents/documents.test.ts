import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { documentsApi } from './documents.api';
import { documentsQueries } from './documents.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('documentsApi', () => {
  it('list calls correct URL without filter', async () => {
    await documentsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents');
  });

  it('list with syncTargetId includes query param', async () => {
    await documentsApi.list('target-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents?syncTargetId=target-1');
  });

  it('list encodes syncTargetId', async () => {
    await documentsApi.list('a b&c');
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/documents?syncTargetId=${encodeURIComponent('a b&c')}`);
  });

  it('getById calls correct URL', async () => {
    await documentsApi.getById('doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1');
  });

  it('getChunks calls correct URL', async () => {
    await documentsApi.getChunks('doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/chunks');
  });

  it('getParsedContent calls correct URL', async () => {
    await documentsApi.getParsedContent('doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/parsed-content');
  });

  it('update uses PATCH method with body', async () => {
    const data = { title: 'New Title' };
    await documentsApi.update('doc-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('retry uses POST method', async () => {
    await documentsApi.retry('doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/retry', {
      method: 'POST',
    });
  });

  it('resync uses POST method', async () => {
    await documentsApi.resync('doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/resync', {
      method: 'POST',
    });
  });

  it('delete uses DELETE method', async () => {
    await documentsApi.delete('doc-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1', {
      method: 'DELETE',
    });
  });

  it('bulkDelete uses POST method with body', async () => {
    const data = { ids: ['doc-1', 'doc-2'] };
    await documentsApi.bulkDelete(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('bulkMetadata uses POST method with body', async () => {
    const data = { ids: ['doc-1'], metadata: { region: 'US' } };
    await documentsApi.bulkMetadata(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/bulk-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('metadataFields calls correct URL without filter', async () => {
    await documentsApi.metadataFields();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/metadata-fields');
  });

  it('metadataFields with syncTargetId includes query param', async () => {
    await documentsApi.metadataFields('st-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/metadata-fields?syncTargetId=st-1');
  });

  it('move uses POST method with body', async () => {
    const data = { sourceKey: 'new/path.pdf' };
    await documentsApi.move('doc-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/documents/doc-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });
});

describe('documentsQueries', () => {
  it('list returns correct query key', () => {
    const opts = documentsQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.documents.list());
  });

  it('list with filters returns correct query key', () => {
    const filters = { syncTargetId: 'st-1' };
    const opts = documentsQueries.list(filters);
    expect(opts.queryKey).toEqual(queryKeys.documents.list(filters));
  });

  it('list queryFn calls documentsApi.list', async () => {
    const opts = documentsQueries.list({ syncTargetId: 'st-1' });
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/documents?syncTargetId=st-1');
  });

  it('detail returns correct query key', () => {
    const opts = documentsQueries.detail('doc-1');
    expect(opts.queryKey).toEqual(queryKeys.documents.detail('doc-1'));
  });

  it('detail is enabled when id is provided', () => {
    const opts = documentsQueries.detail('doc-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when id is empty', () => {
    const opts = documentsQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('chunks returns correct query key', () => {
    const opts = documentsQueries.chunks('doc-1');
    expect(opts.queryKey).toEqual(queryKeys.documents.chunks('doc-1'));
  });

  it('chunks has staleTime of 5 minutes', () => {
    const opts = documentsQueries.chunks('doc-1');
    expect(opts.staleTime).toBe(300_000);
  });

  it('chunks is enabled when id is provided', () => {
    const opts = documentsQueries.chunks('doc-1');
    expect(opts.enabled).toBe(true);
  });

  it('chunks is disabled when id is empty', () => {
    const opts = documentsQueries.chunks('');
    expect(opts.enabled).toBe(false);
  });

  it('parsedContent returns correct query key', () => {
    const opts = documentsQueries.parsedContent('doc-1');
    expect(opts.queryKey).toEqual(queryKeys.documents.parsedContent('doc-1'));
  });

  it('parsedContent has staleTime of 5 minutes', () => {
    const opts = documentsQueries.parsedContent('doc-1');
    expect(opts.staleTime).toBe(300_000);
  });

  it('parsedContent is disabled when id is empty', () => {
    const opts = documentsQueries.parsedContent('');
    expect(opts.enabled).toBe(false);
  });

  it('metadataFields returns correct query key', () => {
    const opts = documentsQueries.metadataFields('st-1');
    expect(opts.queryKey).toEqual(queryKeys.documents.metadataFields('st-1'));
  });

  it('metadataFields queryFn calls documentsApi.metadataFields', async () => {
    const opts = documentsQueries.metadataFields('st-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/documents/metadata-fields?syncTargetId=st-1');
  });
});
