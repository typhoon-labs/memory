import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { tracesApi } from './traces.api';
import type { TraceListParams } from './traces.types';

/** TanStack Query option factories for traces. */
export const tracesQueries = {
  /** List traces with optional filters. */
  list: (filters?: TraceListParams) =>
    queryOptions({
      queryKey: queryKeys.traces.list(filters),
      queryFn: () => tracesApi.list(filters),
    }),

  /** Single trace detail with spans. */
  detail: (traceId: string) =>
    queryOptions({
      queryKey: queryKeys.traces.detail(traceId),
      queryFn: () => tracesApi.getDetail(traceId),
      enabled: !!traceId,
    }),
};
