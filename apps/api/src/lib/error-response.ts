import type { Context } from 'hono';

const ERROR_STATUS: Record<string, number> = {
  // Generic
  'not-found': 404,
  'validation-failed': 400,
  conflict: 409,
  forbidden: 403,

  // Documents
  'not-error-state': 400,
  unsupported: 400,
  'already-processing': 409,
  'Not found': 404,
  'Sync target not found': 404,
  'Metadata validation failed': 400,
  'Document is not in an error state': 400,
  'Document is already being processed': 409,
  'Cannot re-sync a deleted document': 400,
  'Move is not supported for this source type': 400,
  'No parser available': 400,

  // Sync targets
  'config-managed-edit': 403,
  'config-managed-delete': 403,
  inactive: 400,
  'no-template': 400,
  'template-not-found': 404,
  'upload-not-supported': 400,
  'browse-not-supported': 400,
  'create-folder-not-supported': 400,
  'delete-folder-not-supported': 400,
  'move-folder-not-supported': 400,
  'no-files': 400,
  'no-running-sync': 404,

  // Scorers / datasets / experiments
  'target-not-found': 404,
  'dataset-not-found': 404,
  'version-not-found': 404,
  'scorer-execution-failed': 500,

  // Reviews
  'thread-not-found': 404,
  'message-not-found': 404,

  // Traces
  'Trace not found': 404,

  // Queues
  'Queue not found': 404,
  'Job not found': 404,
};

/** Human-readable overrides for terse service error codes. */
const ERROR_MESSAGE: Record<string, string> = {
  'not-found': 'Not found',
  'config-managed-edit': 'Cannot edit config-managed sync target',
  'config-managed-delete': 'Cannot delete config-managed sync target',
  'no-template': 'Sync target has no metadata template assigned',
  'template-not-found': 'Metadata template not found',
  inactive: 'Sync target is inactive',
  'upload-not-supported': 'Upload is not supported for this source type',
  'browse-not-supported': 'Browse is not supported for this source type',
  'create-folder-not-supported': 'Folder creation is not supported for this source type',
  'delete-folder-not-supported': 'Folder deletion is not supported for this source type',
  'move-folder-not-supported': 'Folder move is not supported for this source type',
  'no-files': 'No files provided',
  'no-running-sync': 'No running sync job found for this target',
  'thread-not-found': 'Thread not found',
  'message-not-found': 'Message not found',
  conflict: 'Annotation already exists. Use PATCH to update.',
};

/**
 * Maps a service error result to an HTTP JSON response.
 * Routes call this when `isError(result)` is true.
 *
 * @param defaultStatus — fallback HTTP status when the error string is not in the map (default 500)
 */
export function errorResponse(c: Context, result: { error: string; details?: unknown }, defaultStatus = 500) {
  const status = ERROR_STATUS[result.error] ?? defaultStatus;
  const message = ERROR_MESSAGE[result.error] ?? result.error;
  const body: { error: string; details?: unknown } = { error: message };
  if (result.details) body.details = result.details;
  return c.json(body, status as Parameters<typeof c.json>[1]);
}
