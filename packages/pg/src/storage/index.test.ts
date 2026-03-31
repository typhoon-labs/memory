import { createDb } from '@typhoon/db';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresStore } from './index.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('PostgresStore (integration)', () => {
  let sql: ReturnType<typeof postgres>;

  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('constructs with shared db and sql', () => {
    sql = postgres(TEST_DB_URL);
    const db = createDb(sql);
    const store = new PostgresStore({ id: 'test-shared', db, sql });
    expect(store.id).toBe('test-shared');
  });

  it('constructs with connectionString', () => {
    const store = new PostgresStore({ id: 'test-cs', connectionString: TEST_DB_URL });
    expect(store.id).toBe('test-cs');
  });

  it('getStore("memory") returns memory domain', async () => {
    sql = postgres(TEST_DB_URL);
    const db = createDb(sql);
    const store = new PostgresStore({ id: 'test-memory', db, sql });
    const memory = await store.getStore('memory');
    expect(memory).toBeDefined();
  });

  it('getStore("workflows") returns workflows domain', async () => {
    sql = postgres(TEST_DB_URL);
    const db = createDb(sql);
    const store = new PostgresStore({ id: 'test-wf', db, sql });
    const workflows = await store.getStore('workflows');
    expect(workflows).toBeDefined();
  });
});
