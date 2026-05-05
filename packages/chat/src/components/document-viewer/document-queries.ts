import { apiFetch } from '@typhoon/ui';

interface DocumentChunk {
  text: string;
  startIndex: number | null;
}

interface DocumentMeta {
  id: string;
  title: string | null;
  description: string | null;
  sourceKey: string;
  mimeType: string | null;
  chunkCount: number;
  fileSize: number | null;
}

export interface DocumentContentResponse {
  document: DocumentMeta;
  chunks: DocumentChunk[];
}

export interface DocumentParsedResponse {
  text: string;
}

const STALE_TIME = 300_000; // 5 minutes — documents don't change during a session

/** Shared TanStack Query options for document content (chunks from DB — fast). */
export function documentContentQuery(docId: string) {
  return {
    queryKey: ['document-content', docId] as const,
    queryFn: () => apiFetch<DocumentContentResponse>(`/api/v1/documents/${docId}/chunks`),
    staleTime: STALE_TIME,
  };
}

/** Shared TanStack Query options for parsed document content (from S3 — slow). */
export function documentParsedQuery(docId: string) {
  return {
    queryKey: ['document-parsed', docId] as const,
    queryFn: () => apiFetch<DocumentParsedResponse>(`/api/v1/documents/${docId}/parsed-content`),
    staleTime: STALE_TIME,
  };
}
