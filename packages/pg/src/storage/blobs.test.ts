import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleBlobsStorage } from './blobs.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('DrizzleBlobsStorage (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let storage: DrizzleBlobsStorage;

  beforeAll(() => {
    sql = postgres(TEST_DB_URL);
    storage = new DrizzleBlobsStorage(sql);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('put and get', async () => {
    await storage.put({ hash: 'abc123', content: 'hello world', size: 11, mimeType: 'text/plain' });

    const result = await storage.get('abc123');
    expect(result).not.toBeNull();
    expect((result as Record<string, string>).content).toBe('hello world');
  });

  it('get returns null for non-existent', async () => {
    const result = await storage.get('nonexistent');
    expect(result).toBeNull();
  });

  it('has returns true/false', async () => {
    await storage.put({ hash: 'h1', content: 'data', size: 4 });

    expect(await storage.has('h1')).toBe(true);
    expect(await storage.has('h2')).toBe(false);
  });

  it('delete', async () => {
    await storage.put({ hash: 'del-h', content: 'x', size: 1 });
    const deleted = await storage.delete('del-h');
    expect(deleted).toBe(true);
    expect(await storage.has('del-h')).toBe(false);
  });

  it('delete returns false for non-existent', async () => {
    const deleted = await storage.delete('no-such-hash');
    expect(deleted).toBe(false);
  });

  it('putMany and getMany', async () => {
    await storage.putMany([
      { hash: 'pm-1', content: 'a', size: 1 },
      { hash: 'pm-2', content: 'b', size: 1 },
      { hash: 'pm-3', content: 'c', size: 1 },
    ]);

    const map = await storage.getMany(['pm-1', 'pm-3']);
    expect(map.size).toBe(2);
    expect(map.has('pm-1')).toBe(true);
    expect(map.has('pm-2')).toBe(false);
    expect(map.has('pm-3')).toBe(true);
  });

  it('getMany with empty array returns empty map', async () => {
    const map = await storage.getMany([]);
    expect(map.size).toBe(0);
  });

  it('put is idempotent (ON CONFLICT DO NOTHING)', async () => {
    await storage.put({ hash: 'idem', content: 'first', size: 5 });
    await storage.put({ hash: 'idem', content: 'second', size: 6 });

    const result = await storage.get('idem');
    // Should keep the first insert (DO NOTHING on conflict)
    expect((result as Record<string, string>).content).toBe('first');
  });
});
