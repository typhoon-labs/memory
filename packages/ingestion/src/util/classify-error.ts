import { UnrecoverableError } from 'bullmq';

/**
 * Returns true if `err` represents a permanent failure that retrying cannot
 * fix. Used by job handlers to short-circuit BullMQ's default 3× retry for
 * errors that will only waste time and capacity (deleted source files,
 * misconfigured providers, missing parsers, 4xx auth/not-found errors).
 *
 * Recoverable errors: network blips, 5xx, 408 (timeout), 429 (throttling),
 * StageTimeoutError (covered by retry budget at the queue level).
 */

const UNRECOVERABLE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /^Sync target not found/,
  /^No provider for source type/,
  /^No parser for/,
  /^Empty response body/,
];

const UNRECOVERABLE_AWS_CODES: ReadonlySet<string> = new Set([
  'NoSuchKey',
  'NoSuchBucket',
  'AccessDenied',
  'InvalidBucketName',
  'Forbidden',
]);

interface AwsLikeError {
  Code?: string;
  name?: string;
  status?: number;
  statusCode?: number;
  $metadata?: { httpStatusCode?: number };
}

export function isUnrecoverable(err: unknown): boolean {
  if (err instanceof UnrecoverableError) return true;
  if (!(err instanceof Error)) return false;

  if (UNRECOVERABLE_MESSAGE_PATTERNS.some((p) => p.test(err.message))) return true;

  const awsLike = err as unknown as AwsLikeError;

  // AWS SDK ServiceError exposes the error code on `.Code` (older SDK) or
  // `.name` (newer SDK). Check both.
  const code = awsLike.Code ?? awsLike.name;
  if (typeof code === 'string' && UNRECOVERABLE_AWS_CODES.has(code)) return true;

  // HTTP status code from various conventions. 408 and 429 are recoverable.
  const httpStatus = awsLike.status ?? awsLike.statusCode ?? awsLike.$metadata?.httpStatusCode;
  if (
    typeof httpStatus === 'number' &&
    httpStatus >= 400 &&
    httpStatus < 500 &&
    httpStatus !== 408 &&
    httpStatus !== 429
  ) {
    return true;
  }

  return false;
}

/** Wraps an arbitrary error as an UnrecoverableError so BullMQ skips retries. */
export function asUnrecoverable(err: unknown, ctx?: string): UnrecoverableError {
  const original = err instanceof Error ? err : new Error(String(err));
  return new UnrecoverableError(ctx ? `${ctx}: ${original.message}` : original.message);
}
