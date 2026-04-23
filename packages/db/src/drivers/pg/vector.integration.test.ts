import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DB_URL } from './test-utils';
import { PgVector } from './vector';

const TEST_INDEX = `test_vectors_${Date.now()}`;

describe('PgVector (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let vector: PgVector;

  beforeAll(() => {
    sql = postgres(TEST_DB_URL, { max: 1 });
    vector = new PgVector({ id: 'test', sql });
  });

  afterAll(async () => {
    await vector.deleteIndex({ indexName: TEST_INDEX }).catch(() => {});
    await sql.end();
  });

  it('createIndex creates a table with vector column', async () => {
    await vector.createIndex({ indexName: TEST_INDEX, dimension: 3 });
    const indexes = await vector.listIndexes();
    expect(indexes).toContain(TEST_INDEX);
  });

  it('describeIndex returns dimension and count', async () => {
    const stats = await vector.describeIndex({ indexName: TEST_INDEX });
    expect(stats.count).toBe(0);
    expect(stats.dimension).toBeGreaterThan(0);
  });

  it('upsert inserts vectors', async () => {
    const ids = await vector.upsert({
      indexName: TEST_INDEX,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      metadata: [{ label: 'x' }, { label: 'y' }, { label: 'z' }],
      ids: ['v1', 'v2', 'v3'],
    });
    expect(ids).toEqual(['v1', 'v2', 'v3']);

    const stats = await vector.describeIndex({ indexName: TEST_INDEX });
    expect(stats.count).toBe(3);
  });

  it('query returns results sorted by cosine similarity', async () => {
    const results = await vector.query({
      indexName: TEST_INDEX,
      queryVector: [1, 0, 0],
      topK: 3,
    });
    expect(results.length).toBe(3);
    expect(results[0]?.id).toBe('v1');
    expect(results[0]?.score).toBeGreaterThan(0.9);
  });

  it('query with metadata filter', async () => {
    const results = await vector.query({
      indexName: TEST_INDEX,
      queryVector: [1, 0, 0],
      topK: 3,
      filter: { label: 'y' },
    });
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe('v2');
  });

  it('query with includeVector returns vector data', async () => {
    const results = await vector.query({
      indexName: TEST_INDEX,
      queryVector: [1, 0, 0],
      topK: 1,
      includeVector: true,
    });
    expect(results[0]?.vector).toBeDefined();
    expect(results[0]?.vector?.length).toBe(3);
  });

  it('metadata-only query (no vector)', async () => {
    const results = await vector.query({
      indexName: TEST_INDEX,
      filter: { label: 'z' },
      topK: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe('v3');
    expect(results[0]?.score).toBe(0);
  });

  it('upsert updates existing vectors', async () => {
    await vector.upsert({
      indexName: TEST_INDEX,
      vectors: [[0.5, 0.5, 0]],
      metadata: [{ label: 'x-updated' }],
      ids: ['v1'],
    });
    const results = await vector.query({
      indexName: TEST_INDEX,
      filter: { label: 'x-updated' },
      topK: 1,
    });
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe('v1');
  });

  it('updateVector updates metadata', async () => {
    await vector.updateVector({
      indexName: TEST_INDEX,
      id: 'v2',
      update: { metadata: { label: 'y-updated' } },
    });
    const results = await vector.query({
      indexName: TEST_INDEX,
      filter: { label: 'y-updated' },
      topK: 1,
    });
    expect(results.length).toBe(1);
  });

  it('deleteVector removes a single vector', async () => {
    await vector.deleteVector({ indexName: TEST_INDEX, id: 'v3' });
    const stats = await vector.describeIndex({ indexName: TEST_INDEX });
    expect(stats.count).toBe(2);
  });

  it('deleteVectors by filter', async () => {
    await vector.deleteVectors({
      indexName: TEST_INDEX,
      filter: { label: 'y-updated' },
    });
    const stats = await vector.describeIndex({ indexName: TEST_INDEX });
    expect(stats.count).toBe(1);
  });

  it('deleteIndex drops the table', async () => {
    await vector.deleteIndex({ indexName: TEST_INDEX });
    const indexes = await vector.listIndexes();
    expect(indexes).not.toContain(TEST_INDEX);
  });
});
