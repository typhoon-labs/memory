import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { syncTargetsApi } from './sync-targets.api';

/** TanStack Query option factories for sync targets. */
export const syncTargetsQueries = {
  /** List all sync targets. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.syncTargets.list(),
      queryFn: () => syncTargetsApi.list(),
    }),

  /** Single sync target detail. */
  detail: (id: string) =>
    queryOptions({
      queryKey: queryKeys.syncTargets.detail(id),
      queryFn: () => syncTargetsApi.getById(id),
      enabled: !!id,
    }),

  /** Sync jobs for a target. */
  jobs: (id: string) =>
    queryOptions({
      queryKey: queryKeys.syncTargets.jobs(id),
      queryFn: () => syncTargetsApi.getJobs(id),
      enabled: !!id,
    }),

  /** Browse files at a prefix (S3 only). */
  browse: (id: string, path?: string) =>
    queryOptions({
      queryKey: queryKeys.syncTargets.browse(id, path),
      queryFn: () => syncTargetsApi.browse(id, path),
      enabled: !!id,
    }),
};
