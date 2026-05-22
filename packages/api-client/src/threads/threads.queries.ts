import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { threadsApi } from './threads.api';

/** TanStack Query option factories for threads. */
export const threadsQueries = {
  /** List threads for the current user. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.threads.list(),
      queryFn: () => threadsApi.list(),
    }),

  /** Single thread detail with messages. */
  detail: (threadId: string) =>
    queryOptions({
      queryKey: queryKeys.threads.detail(threadId),
      queryFn: () => threadsApi.getById(threadId),
      enabled: !!threadId,
    }),
};
