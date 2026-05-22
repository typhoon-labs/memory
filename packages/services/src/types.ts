/**
 * Discriminated union for service return values.
 * Services return Result<T> instead of throwing errors.
 * Routes map error strings to HTTP status codes.
 */
export type Result<T> = { data: T } | { error: string; details?: unknown };

/** Type guard to check if a result is an error. */
export function isError<T>(result: Result<T>): result is { error: string; details?: unknown } {
  return 'error' in result;
}
