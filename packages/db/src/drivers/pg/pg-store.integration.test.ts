import { afterAll, describe, expect, it } from 'vitest';
import { PgStore } from './index';
import { createTestConnection, TEST_DB_URL } from './test-utils';

describe('PgStore (integration)', () => {
  const connections: Array<{ sql: { end: () => Promise<void> } }> = [];

  afterAll(async () => {
    for (const conn of connections) {
      await conn.sql.end();
    }
  });

  it('constructs with shared db and sql', () => {
    const conn = createTestConnection();
    connections.push(conn);
    const store = new PgStore({ id: 'test-shared', db: conn.db, sql: conn.sql });
    expect(store.id).toBe('test-shared');
  });

  it('constructs with connectionString', () => {
    const store = new PgStore({ id: 'test-cs', connectionString: TEST_DB_URL });
    expect(store.id).toBe('test-cs');
  });

  it('getStore("memory") returns memory domain', async () => {
    const conn = createTestConnection();
    connections.push(conn);
    const store = new PgStore({ id: 'test-memory', db: conn.db, sql: conn.sql });
    const memory = await store.getStore('memory');
    expect(memory).toBeDefined();
  });

  it('getStore("workflows") returns workflows domain', async () => {
    const conn = createTestConnection();
    connections.push(conn);
    const store = new PgStore({ id: 'test-wf', db: conn.db, sql: conn.sql });
    const workflows = await store.getStore('workflows');
    expect(workflows).toBeDefined();
  });
});
