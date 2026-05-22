import { queryOptions } from '@tanstack/react-query';

import { queryKeys } from '../query-keys';
import { documentsApi } from './documents.api';

const STALE_TIME = 300_000; // 5 minutes

/** TanStack Query option factories for documents. */
export const documentsQueries = {
  /** List documents, optionally filtered by sync target. */
  list: (filters?: { syncTargetId?: string }) =>
    queryOptions({
      queryKey: queryKeys.documents.list(filters),
      queryFn: () => documentsApi.list(filters?.syncTargetId),
    }),

  /** Single document detail. */
  detail: (id: string) =>
    queryOptions({
      queryKey: queryKeys.documents.detail(id),
      queryFn: () => documentsApi.getById(id),
      enabled: !!id,
    }),

  /** Document chunks (assembled content from DB — fast). */
  chunks: (id: string) =>
    queryOptions({
      queryKey: queryKeys.documents.chunks(id),
      queryFn: () => documentsApi.getChunks(id),
      staleTime: STALE_TIME,
      enabled: !!id,
    }),

  /** Parsed document content (from S3 — slower). */
  parsedContent: (id: string) =>
    queryOptions({
      queryKey: queryKeys.documents.parsedContent(id),
      queryFn: () => documentsApi.getParsedContent(id),
      staleTime: STALE_TIME,
      enabled: !!id,
    }),

  /** Distinct metadata field values. */
  metadataFields: (syncTargetId?: string) =>
    queryOptions({
      queryKey: queryKeys.documents.metadataFields(syncTargetId),
      queryFn: () => documentsApi.metadataFields(syncTargetId),
    }),
};
