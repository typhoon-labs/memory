import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { feedbackApi } from './feedback.api';
import { feedbackQueries } from './feedback.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('feedbackApi', () => {
  it('upsert uses POST method with body', async () => {
    const data = { threadId: 't-1', messageId: 'm-1', rating: 'positive' };
    await feedbackApi.upsert(data as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('listByThread calls correct URL with encoded threadId', async () => {
    await feedbackApi.listByThread('thread-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/feedback?threadId=thread-1');
  });

  it('listByThread encodes special characters in threadId', async () => {
    await feedbackApi.listByThread('a b&c');
    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/feedback?threadId=${encodeURIComponent('a b&c')}`);
  });

  it('listAll calls correct URL', async () => {
    await feedbackApi.listAll();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/feedback');
  });
});

describe('feedbackQueries', () => {
  it('byThread returns correct query key', () => {
    const opts = feedbackQueries.byThread('t-1');
    expect(opts.queryKey).toEqual(queryKeys.feedback.byThread('t-1'));
  });

  it('byThread is enabled when threadId is provided', () => {
    const opts = feedbackQueries.byThread('t-1');
    expect(opts.enabled).toBe(true);
  });

  it('byThread is disabled when threadId is empty', () => {
    const opts = feedbackQueries.byThread('');
    expect(opts.enabled).toBe(false);
  });

  it('byThread queryFn calls feedbackApi.listByThread', async () => {
    const opts = feedbackQueries.byThread('t-1');
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/feedback?threadId=t-1');
  });

  it('all returns correct query key', () => {
    const opts = feedbackQueries.all();
    expect(opts.queryKey).toEqual(queryKeys.feedback.all);
  });

  it('all queryFn calls feedbackApi.listAll', async () => {
    const opts = feedbackQueries.all();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/feedback');
  });
});
