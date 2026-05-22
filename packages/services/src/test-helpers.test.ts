import { describe, expect, it } from 'vitest';

import { assertErr, assertOk } from './test-helpers';
import type { Result } from './types';

describe('assertOk', () => {
  it('returns data from a successful result', () => {
    const result: Result<number> = { data: 42 };
    expect(assertOk(result)).toBe(42);
  });

  it('returns complex data preserving type', () => {
    const result: Result<{ id: string; name: string }> = { data: { id: '1', name: 'test' } };
    const data = assertOk(result);
    expect(data.id).toBe('1');
    expect(data.name).toBe('test');
  });

  it('throws on an error result', () => {
    const result: Result<number> = { error: 'not found' };
    expect(() => assertOk(result)).toThrow('data');
  });

  it('throws on an error result with details', () => {
    const result: Result<number> = { error: 'validation failed', details: { field: 'name' } };
    expect(() => assertOk(result)).toThrow('data');
  });
});

describe('assertErr', () => {
  it('returns error string from an error result', () => {
    const result: Result<number> = { error: 'not found' };
    expect(assertErr(result)).toBe('not found');
  });

  it('returns error string when details are present', () => {
    const result: Result<number> = { error: 'bad request', details: 'missing field' };
    expect(assertErr(result)).toBe('bad request');
  });

  it('throws on a successful result', () => {
    const result: Result<number> = { data: 42 };
    expect(() => assertErr(result)).toThrow('error');
  });
});
