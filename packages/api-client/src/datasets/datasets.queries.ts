import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { datasetsApi } from './datasets.api';

/** TanStack Query option factories for datasets. */
export const datasetsQueries = {
  /** List all datasets. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.datasets.list(),
      queryFn: () => datasetsApi.list(),
    }),

  /** Single dataset detail. */
  detail: (id: string) =>
    queryOptions({
      queryKey: queryKeys.datasets.detail(id),
      queryFn: () => datasetsApi.getById(id),
      enabled: !!id,
    }),

  /** Dataset items. */
  items: (id: string, version?: number) =>
    queryOptions({
      queryKey: queryKeys.datasets.items(id, version),
      queryFn: () => datasetsApi.listItems(id),
      enabled: !!id,
    }),
};
