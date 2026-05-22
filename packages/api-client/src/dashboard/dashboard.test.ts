import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { apiFetch } from '../client';
import { queryKeys } from '../query-keys';
import { dashboardApi } from './dashboard.api';
import { dashboardQueries } from './dashboard.queries';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboardApi', () => {
  it('getScores calls correct URL without params', async () => {
    await dashboardApi.getScores();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/scores');
  });

  it('getScores includes query params', async () => {
    await dashboardApi.getScores({ dateFrom: '2024-01-01', dateTo: '2024-01-31' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/dashboard/scores?');
    expect(url).toContain('dateFrom=2024-01-01');
    expect(url).toContain('dateTo=2024-01-31');
  });

  it('getScores includes range param', async () => {
    await dashboardApi.getScores({ range: '7d' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('range=7d');
  });

  it('getThreads calls correct URL without params', async () => {
    await dashboardApi.getThreads();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/threads');
  });

  it('getThreads includes query params', async () => {
    await dashboardApi.getThreads({ dateFrom: '2024-06-01' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('dateFrom=2024-06-01');
  });

  it('getUsers calls correct URL without params', async () => {
    await dashboardApi.getUsers();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/users');
  });

  it('getUsers includes query params', async () => {
    await dashboardApi.getUsers({ range: '30d' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('range=30d');
  });

  it('getLatency calls correct URL', async () => {
    await dashboardApi.getLatency();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/latency');
  });

  it('getLatency includes query params', async () => {
    await dashboardApi.getLatency({ dateFrom: '2024-01-01' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('dateFrom=2024-01-01');
  });

  it('getCost calls correct URL', async () => {
    await dashboardApi.getCost();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/dashboard/cost');
  });

  it('getCost includes query params', async () => {
    await dashboardApi.getCost({ dateTo: '2024-12-31' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('dateTo=2024-12-31');
  });

  it('skips undefined/null params', async () => {
    await dashboardApi.getScores({ dateFrom: undefined, range: '7d' });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('dateFrom');
    expect(url).toContain('range=7d');
  });
});

describe('dashboardQueries', () => {
  it('scores returns correct query key', () => {
    const params = { dateFrom: '2024-01-01', dateTo: '2024-01-31' };
    const opts = dashboardQueries.scores(params);
    expect(opts.queryKey).toEqual(queryKeys.dashboard.scores(params));
  });

  it('scores without params returns correct query key', () => {
    const opts = dashboardQueries.scores();
    expect(opts.queryKey).toEqual(queryKeys.dashboard.scores());
  });

  it('scores queryFn calls dashboardApi.getScores', async () => {
    const params = { range: '7d' };
    const opts = dashboardQueries.scores(params);
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/dashboard/scores');
  });

  it('conversations returns correct query key', () => {
    const params = { range: '7d' };
    const opts = dashboardQueries.conversations(params);
    expect(opts.queryKey).toEqual(queryKeys.dashboard.conversations(params));
  });

  it('conversations queryFn calls dashboardApi.getThreads', async () => {
    const opts = dashboardQueries.conversations({ range: '30d' });
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/dashboard/threads');
  });

  it('overview returns correct query key', () => {
    const opts = dashboardQueries.overview();
    expect(opts.queryKey).toEqual(queryKeys.dashboard.overview());
  });

  it('overview queryFn calls dashboardApi.getUsers', async () => {
    const opts = dashboardQueries.overview();
    await opts.queryFn!({} as never);
    expect(mockApiFetch).toHaveBeenCalled();
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/admin/dashboard/users');
  });
});
