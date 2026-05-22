import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { experimentsApi } from './experiments.api';

/** TanStack Query option factories for experiments. */
export const experimentsQueries = {
  /** List all experiments. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.experiments.list(),
      queryFn: () => experimentsApi.list(),
    }),

  /** Single experiment detail. */
  detail: (id: string) =>
    queryOptions({
      queryKey: queryKeys.experiments.detail(id),
      queryFn: () => experimentsApi.getById(id),
      enabled: !!id,
    }),

  /** Experiment results. */
  results: (id: string) =>
    queryOptions({
      queryKey: queryKeys.experiments.results(id),
      queryFn: () => experimentsApi.getResults(id),
      enabled: !!id,
    }),

  /** Compare two experiments. */
  compare: (ids: string[]) =>
    queryOptions({
      queryKey: queryKeys.experiments.compare(ids),
      queryFn: () => experimentsApi.compare(ids[0], ids[1]),
      enabled: ids.length === 2,
    }),
};
