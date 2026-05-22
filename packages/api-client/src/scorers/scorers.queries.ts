import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { scorersApi } from './scorers.api';

/** TanStack Query option factories for scorers. */
export const scorersQueries = {
  /** List all scorers. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.scorers.list(),
      queryFn: () => scorersApi.list(),
    }),

  /** Single scorer detail with active version. */
  detail: (id: string) =>
    queryOptions({
      queryKey: queryKeys.scorers.detail(id),
      queryFn: () => scorersApi.getById(id),
      enabled: !!id,
    }),

  /** Available scorer categories/models. */
  categories: () =>
    queryOptions({
      queryKey: queryKeys.scorers.categories(),
      queryFn: () => scorersApi.getModels(),
    }),
};
