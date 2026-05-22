/**
 * Integration test for buildFilterQuery — verifies the generated SQL actually
 * executes correctly against a real PostgreSQL database with JSONB data.
 *
 * The unit test (filter.test.ts) validates SQL string generation.
 * This test validates Postgres execution semantics.
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildFilterQuery } from './filter';
import { TEST_DB_URL } from './test-utils';

const TABLE = `test_filter_${Date.now()}`;

describe('buildFilterQuery (integration)', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL, { max: 1 });

    // Create a temp table with a JSONB metadata column
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id TEXT PRIMARY KEY,
        metadata JSONB NOT NULL DEFAULT '{}'
      )
    `);

    // Seed test data
    await sql.unsafe(`
      INSERT INTO ${TABLE} (id, metadata) VALUES
        ('doc-1', '{"status": "active", "region": "US", "score": 85, "tags": ["legal", "support"]}'::jsonb),
        ('doc-2', '{"status": "active", "region": "EU", "score": 42, "tags": ["faq"]}'::jsonb),
        ('doc-3', '{"status": "deleted", "region": "US", "score": 100, "tags": ["legal", "faq"]}'::jsonb),
        ('doc-4', '{"status": "draft", "score": 0}'::jsonb),
        ('doc-5', '{"status": "active", "region": null}'::jsonb)
    `);
  });

  afterAll(async () => {
    await sql.unsafe(`DROP TABLE IF EXISTS ${TABLE}`);
    await sql.end();
  });

  async function queryIds(filter: Record<string, unknown>): Promise<string[]> {
    const { sql: whereSql, values } = buildFilterQuery(filter);
    const query = `SELECT id FROM ${TABLE} WHERE ${whereSql} ORDER BY id`;
    const rows = await sql.unsafe(query, values);
    return rows.map((r) => (r as Record<string, unknown>).id as string);
  }

  // ── $eq ──────────────────────────────────────────────────────────────────

  it('$eq matches exact string value', async () => {
    const ids = await queryIds({ status: 'active' });
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-5']);
  });

  it('$eq with null matches missing/null JSONB keys', async () => {
    const ids = await queryIds({ region: { $eq: null } });
    // doc-4 has no region key, doc-5 has region: null
    expect(ids).toContain('doc-4');
    expect(ids).toContain('doc-5');
  });

  // ── $ne ──────────────────────────────────────────────────────────────────

  it('$ne excludes matching values', async () => {
    const ids = await queryIds({ status: { $ne: 'active' } });
    expect(ids).toContain('doc-3'); // deleted
    expect(ids).toContain('doc-4'); // draft
    expect(ids).not.toContain('doc-1');
  });

  it('$ne with null returns rows where key exists and is non-null', async () => {
    const ids = await queryIds({ region: { $ne: null } });
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });

  // ── $in ──────────────────────────────────────────────────────────────────

  it('$in matches any of the values', async () => {
    const ids = await queryIds({ region: { $in: ['US', 'EU'] } });
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });

  it('$in with empty array returns no results', async () => {
    const ids = await queryIds({ status: { $in: [] } });
    expect(ids).toEqual([]);
  });

  // ── $nin ─────────────────────────────────────────────────────────────────

  it('$nin excludes matching values and includes null/missing', async () => {
    const ids = await queryIds({ region: { $nin: ['US'] } });
    // EU (doc-2), null region (doc-4, doc-5)
    expect(ids).toContain('doc-2');
    expect(ids).toContain('doc-4');
    expect(ids).toContain('doc-5');
    expect(ids).not.toContain('doc-1');
  });

  // ── Numeric range operators ──────────────────────────────────────────────

  it('$gt returns rows with score > threshold', async () => {
    const ids = await queryIds({ score: { $gt: 50 } });
    expect(ids).toEqual(['doc-1', 'doc-3']); // 85, 100
  });

  it('$gte includes boundary value', async () => {
    const ids = await queryIds({ score: { $gte: 85 } });
    expect(ids).toEqual(['doc-1', 'doc-3']); // 85, 100
  });

  it('$lt returns rows below threshold', async () => {
    const ids = await queryIds({ score: { $lt: 50 } });
    expect(ids).toEqual(['doc-2', 'doc-4']); // 42, 0
  });

  it('$lte includes boundary value', async () => {
    const ids = await queryIds({ score: { $lte: 42 } });
    expect(ids).toEqual(['doc-2', 'doc-4']); // 42, 0
  });

  // ── $regex ───────────────────────────────────────────────────────────────

  it('$regex matches with PostgreSQL regex', async () => {
    const ids = await queryIds({ status: { $regex: '^act' } });
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-5']);
  });

  // ── $contains (ILIKE) ────────────────────────────────────────────────────

  it('$contains does case-insensitive substring match', async () => {
    const ids = await queryIds({ status: { $contains: 'ACT' } });
    expect(ids).toEqual(['doc-1', 'doc-2', 'doc-5']);
  });

  // ── $exists ──────────────────────────────────────────────────────────────

  it('$exists: true returns rows where key exists in JSONB', async () => {
    const ids = await queryIds({ region: { $exists: true } });
    // doc-1, doc-2, doc-3 have region key; doc-5 has region: null (key still exists)
    expect(ids).toContain('doc-1');
    expect(ids).toContain('doc-5');
    expect(ids).not.toContain('doc-4');
  });

  it('$exists: false returns rows where key is missing', async () => {
    const ids = await queryIds({ region: { $exists: false } });
    expect(ids).toEqual(['doc-4']);
  });

  // ── $all ─────────────────────────────────────────────────────────────────

  it('$all returns rows containing all specified values in array', async () => {
    const ids = await queryIds({ tags: { $all: ['legal', 'faq'] } });
    expect(ids).toEqual(['doc-3']); // only doc-3 has both
  });

  // ── Logical operators ────────────────────────────────────────────────────

  it('$and combines multiple conditions', async () => {
    const ids = await queryIds({
      $and: [{ status: 'active' }, { region: 'US' }],
    });
    expect(ids).toEqual(['doc-1']);
  });

  it('$or matches either condition', async () => {
    const ids = await queryIds({
      $or: [{ region: 'EU' }, { status: 'draft' }],
    });
    expect(ids).toEqual(['doc-2', 'doc-4']);
  });

  it('$not negates a condition', async () => {
    const ids = await queryIds({
      $not: { status: 'active' },
    });
    expect(ids).toEqual(['doc-3', 'doc-4']);
  });

  // ── Combined field operators ─────────────────────────────────────────────

  it('range query with both $gte and $lte', async () => {
    const ids = await queryIds({ score: { $gte: 42, $lte: 85 } });
    expect(ids).toEqual(['doc-1', 'doc-2']); // 85, 42
  });
});
