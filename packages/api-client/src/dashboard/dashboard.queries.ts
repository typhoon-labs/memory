import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { dashboardApi } from './dashboard.api';

/** TanStack Query option factories for the dashboard. */
export const dashboardQueries = {
  /** Score time-series. */
  scores: (params?: { dateFrom?: string; dateTo?: string; range?: string }) =>
    queryOptions({
      queryKey: queryKeys.dashboard.scores(params),
      queryFn: () => dashboardApi.getScores(params),
    }),

  /** Worst-performing threads (conversations). */
  conversations: (params?: { dateFrom?: string; dateTo?: string; range?: string }) =>
    queryOptions({
      queryKey: queryKeys.dashboard.conversations(params),
      queryFn: () => dashboardApi.getThreads(params),
    }),

  /** Overview / general dashboard data. */
  overview: (params?: { dateFrom?: string; dateTo?: string; range?: string }) =>
    queryOptions({
      queryKey: queryKeys.dashboard.overview(params),
      queryFn: () => dashboardApi.getUsers(params),
    }),
};
