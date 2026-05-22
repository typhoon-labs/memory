import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { reviewsApi } from './reviews.api';
import { reviewsQueries } from './reviews.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reviewsApi', () => {
  it('list calls correct URL without filters', async () => {
    await reviewsApi.list();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews');
  });

  it('list includes sortBy filter', async () => {
    await reviewsApi.list({ sortBy: 'score' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('sortBy=score');
  });

  it('list includes annotationStatus filter', async () => {
    await reviewsApi.list({ annotationStatus: 'pending' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('annotationStatus=pending');
  });

  it('list includes both filters', async () => {
    await reviewsApi.list({ sortBy: 'date', annotationStatus: 'completed' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('sortBy=date');
    expect(url).toContain('annotationStatus=completed');
  });

  it('getDetail calls correct URL', async () => {
    await reviewsApi.getDetail('t-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1');
  });

  it('createAnnotation uses POST method with body', async () => {
    const data = { score: 5, comment: 'Good' };
    await reviewsApi.createAnnotation('t-1', 'm-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1/messages/m-1/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('updateAnnotation uses PATCH method with body', async () => {
    const data = { score: 3, comment: 'Updated' };
    await reviewsApi.updateAnnotation('t-1', 'm-1', data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1/messages/m-1/annotate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('deleteAnnotation uses DELETE method', async () => {
    await reviewsApi.deleteAnnotation('t-1', 'm-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1/messages/m-1/annotate', {
      method: 'DELETE',
    });
  });
});

describe('reviewsQueries', () => {
  it('list returns correct query key without filters', () => {
    const opts = reviewsQueries.list();
    expect(opts.queryKey).toEqual(queryKeys.reviews.list());
  });

  it('list returns correct query key with filters', () => {
    const filters = { sortBy: 'score', annotationStatus: 'pending' };
    const opts = reviewsQueries.list(filters);
    expect(opts.queryKey).toEqual(queryKeys.reviews.list(filters));
  });

  it('list queryFn calls reviewsApi.list', async () => {
    const opts = reviewsQueries.list({ sortBy: 'score' });
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('sortBy=score');
  });

  it('detail returns correct query key', () => {
    const opts = reviewsQueries.detail('t-1');
    expect(opts.queryKey).toEqual(queryKeys.reviews.detail('t-1'));
  });

  it('detail is enabled when threadId is provided', () => {
    const opts = reviewsQueries.detail('t-1');
    expect(opts.enabled).toBe(true);
  });

  it('detail is disabled when threadId is empty', () => {
    const opts = reviewsQueries.detail('');
    expect(opts.enabled).toBe(false);
  });

  it('detail queryFn calls reviewsApi.getDetail', async () => {
    const opts = reviewsQueries.detail('t-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1');
  });
});
