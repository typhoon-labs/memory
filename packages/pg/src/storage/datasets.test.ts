import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleDatasetsStorage } from './datasets.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('DrizzleDatasetsStorage (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let storage: DrizzleDatasetsStorage;

  beforeAll(() => {
    sql = postgres(TEST_DB_URL);
    storage = new DrizzleDatasetsStorage(sql);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('createDataset and getDatasetById', async () => {
    const ds = await storage.createDataset({ name: 'test-ds', description: 'A dataset' });
    expect(ds).toBeDefined();

    const fetched = await storage.getDatasetById({ id: (ds as Record<string, string>).id });
    expect(fetched).not.toBeNull();
  });

  it('deleteDataset cascades', async () => {
    const ds = await storage.createDataset({ name: 'del-ds' });
    const id = (ds as Record<string, string>).id;

    await storage._doAddItem({ datasetId: id, input: { x: 1 } });
    await storage.deleteDataset({ id });

    const fetched = await storage.getDatasetById({ id });
    expect(fetched).toBeNull();
  });

  it('listDatasets', async () => {
    await storage.createDataset({ name: 'ds-1' });
    await storage.createDataset({ name: 'ds-2' });

    const result = await storage.listDatasets({ page: 0, perPage: 10 });
    expect((result as Record<string, unknown[]>).datasets.length).toBe(2);
  });

  it('addItem, getItemById, listItems', async () => {
    const ds = await storage.createDataset({ name: 'items-ds' });
    const dsId = (ds as Record<string, string>).id;

    const item = await storage._doAddItem({ datasetId: dsId, input: { question: 'hi' }, datasetVersion: 0 });
    const itemId = (item as Record<string, string>).id;

    const fetched = await storage.getItemById({ id: itemId });
    expect(fetched).not.toBeNull();

    const list = await storage.listItems({ datasetId: dsId, page: 0, perPage: 10 });
    expect((list as Record<string, unknown[]>).items.length).toBe(1);
  });

  it('createDatasetVersion', async () => {
    const ds = await storage.createDataset({ name: 'ver-ds' });
    const dsId = (ds as Record<string, string>).id;

    const ver = await storage.createDatasetVersion(dsId, 1);
    expect(ver).toBeDefined();
    expect((ver as Record<string, number>).version).toBe(1);
  });
});
