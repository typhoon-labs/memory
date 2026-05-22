import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { queuesApi } from './queues.api';

/** TanStack Query option factories for queues. */
export const queuesQueries = {
  /** List all queues with job counts. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.queues.list(),
      queryFn: () => queuesApi.list(),
    }),

  /** Single queue detail (workers). */
  detail: (name: string) =>
    queryOptions({
      queryKey: queryKeys.queues.detail(name),
      queryFn: () => queuesApi.listWorkers(name),
      enabled: !!name,
    }),

  /** Jobs in a queue by status. */
  jobs: (name: string, status?: string) =>
    queryOptions({
      queryKey: queryKeys.queues.jobs(name, status),
      queryFn: () => queuesApi.listJobs(name, { state: status }),
      enabled: !!name,
    }),

  /** Failed job archive. */
  failedJobs: () =>
    queryOptions({
      queryKey: queryKeys.queues.failedJobs(),
      queryFn: () => queuesApi.listFailedJobs(),
    }),
};
