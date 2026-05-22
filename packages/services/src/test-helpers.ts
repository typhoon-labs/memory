import { expect } from 'vitest';

import type { Result } from './types';

/**
 * Asserts that a Result is successful and returns the data.
 * Eliminates the `if ('data' in result)` conditional-expect pattern.
 */
export function assertOk<T>(result: Result<T>): T {
  expect(result).toHaveProperty('data');
  return (result as { data: T }).data;
}

/**
 * Asserts that a Result is an error and returns the error string.
 * Eliminates the `if ('error' in result)` conditional-expect pattern.
 */
export function assertErr(result: Result<unknown>): string {
  expect(result).toHaveProperty('error');
  return (result as { error: string }).error;
}
