import { describe, expect, it } from 'vitest';
import { hasConnectionString } from './config.js';

describe('config helpers', () => {
  it('hasConnectionString returns true for connectionString config', () => {
    expect(hasConnectionString({ id: 'test', connectionString: 'postgres://...' })).toBe(true);
  });

  it('hasConnectionString returns false for shared config', () => {
    const fakeDb = {} as never;
    const fakeSql = {} as never;
    expect(hasConnectionString({ id: 'test', db: fakeDb, sql: fakeSql })).toBe(false);
  });

  it('hasConnectionString returns false for sql-only config', () => {
    const fakeSql = {} as never;
    expect(hasConnectionString({ id: 'test', sql: fakeSql })).toBe(false);
  });
});
