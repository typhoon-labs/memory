/**
 * Re-exports document content/parsed queries from @typhoon/api-client.
 * Kept for backward compatibility — consumers should migrate to importing
 * directly from '@typhoon/api-client'.
 */
export type { DocumentContentResponse, DocumentParsedResponse } from '@typhoon/api-client';

export { documentsQueries } from '@typhoon/api-client';

import { documentsQueries } from '@typhoon/api-client';

/** @deprecated Use `documentsQueries.chunks(docId)` from @typhoon/api-client instead. */
export function documentContentQuery(docId: string) {
  return documentsQueries.chunks(docId);
}

/** @deprecated Use `documentsQueries.parsedContent(docId)` from @typhoon/api-client instead. */
export function documentParsedQuery(docId: string) {
  return documentsQueries.parsedContent(docId);
}
