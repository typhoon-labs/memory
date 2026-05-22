import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { feedbackApi } from './feedback.api';

/** TanStack Query option factories for feedback. */
export const feedbackQueries = {
  /** Feedback entries for a specific thread (scoped to current user). */
  byThread: (threadId: string) =>
    queryOptions({
      queryKey: queryKeys.feedback.byThread(threadId),
      queryFn: () => feedbackApi.listByThread(threadId),
      enabled: !!threadId,
    }),

  /** All feedback entries (admin). */
  all: () =>
    queryOptions({
      queryKey: queryKeys.feedback.all,
      queryFn: () => feedbackApi.listAll(),
    }),
};
