import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { PgVector } from '../vector/index.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('table prefix', () => {
  let sql: ReturnType<typeof postgres>;

  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('vector with no prefix uses plain index name', async () => {
    sql = postgres(TEST_DB_URL);
    const vector = new PgVector({ id: 'test', sql });
    const indexName = `prefix_test_none_${Date.now()}`;

    await vector.createIndex({ indexName, dimension: 3 });

    // Table should be named exactly as the indexName (no prefix)
    const [row] = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = ${indexName} AND table_schema = 'public'
    `;
    expect(row).toBeDefined();

    await vector.deleteIndex({ indexName });
  });

  it('vector with prefix prepends to table name', async () => {
    sql = postgres(TEST_DB_URL);
    const vector = new PgVector({ id: 'test', sql, tablePrefix: 'myapp' });
    const indexName = `prefix_test_yes_${Date.now()}`;

    await vector.createIndex({ indexName, dimension: 3 });

    // Table should be named "myapp_<indexName>"
    const expectedTableName = `myapp_${indexName}`;
    const [row] = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = ${expectedTableName} AND table_schema = 'public'
    `;
    expect(row).toBeDefined();

    await vector.deleteIndex({ indexName });
  });
});
