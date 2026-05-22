import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { reviewsApi } from './reviews.api';

/** TanStack Query option factories for reviews. */
export const reviewsQueries = {
  /** List threads for review with optional filters. */
  list: (filters?: { sortBy?: string; annotationStatus?: string }) =>
    queryOptions({
      queryKey: queryKeys.reviews.list(filters),
      queryFn: () => reviewsApi.list(filters),
    }),

  /** Single thread review detail. */
  detail: (threadId: string) =>
    queryOptions({
      queryKey: queryKeys.reviews.detail(threadId),
      queryFn: () => reviewsApi.getDetail(threadId),
      enabled: !!threadId,
    }),
};
