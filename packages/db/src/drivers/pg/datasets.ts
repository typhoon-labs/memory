import { DatasetsStorage } from '@mastra/core/storage';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../client';
import { datasetItems, datasets, datasetVersions } from '../../schema/datasets';

export class DrizzleDatasetsStorage extends DatasetsStorage {
  constructor(private db: Db) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.db.transaction(async (tx) => {
      await tx.delete(datasetItems);
      await tx.delete(datasetVersions);
      await tx.delete(datasets);
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra dataset types
  async createDataset(input: any) {
    const id = input.id ?? crypto.randomUUID();
    const [row] = await this.db
      .insert(datasets)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        metadata: input.metadata ?? null,
        inputSchema: input.inputSchema ?? null,
        groundTruthSchema: input.groundTruthSchema ?? null,
        requestContextSchema: input.requestContextSchema ?? null,
        version: input.version ?? 0,
      })
      .returning();
    return row as never;
  }

  async getDatasetById(args: { id: string }) {
    const [row] = await this.db.select().from(datasets).where(eq(datasets.id, args.id));
    return (row as never) ?? null;
  }

  async deleteDataset(args: { id: string }) {
    await this.db.transaction(async (tx) => {
      await tx.delete(datasetItems).where(eq(datasetItems.datasetId, args.id));
      await tx.delete(datasetVersions).where(eq(datasetVersions.datasetId, args.id));
      await tx.delete(datasets).where(eq(datasets.id, args.id));
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra list types
  async listDatasets(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;

    const [countRow] = await this.db.select({ count: sql<number>`count(*)::int` }).from(datasets);
    const total = countRow?.count ?? 0;

    const rows = await this.db
      .select()
      .from(datasets)
      .orderBy(desc(datasets.createdAt))
      .limit(perPage)
      .offset(page * perPage);

    return { datasets: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doUpdateDataset(args: any) {
    const { id, ...rest } = args;
    const sets: Partial<typeof datasets.$inferInsert> = {};
    if (rest.name !== undefined) sets.name = rest.name;
    if (rest.description !== undefined) sets.description = rest.description;
    if (rest.metadata !== undefined) sets.metadata = rest.metadata;
    if (rest.inputSchema !== undefined) sets.inputSchema = rest.inputSchema;
    if (rest.groundTruthSchema !== undefined) sets.groundTruthSchema = rest.groundTruthSchema;
    if (rest.requestContextSchema !== undefined) sets.requestContextSchema = rest.requestContextSchema;
    if (rest.version !== undefined) sets.version = rest.version;

    const [row] = await this.db.update(datasets).set(sets).where(eq(datasets.id, id)).returning();
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doAddItem(args: any) {
    const id = args.id ?? crypto.randomUUID();
    const [row] = await this.db
      .insert(datasetItems)
      .values({
        id,
        datasetId: args.datasetId,
        datasetVersion: args.datasetVersion ?? 0,
        isDeleted: false,
        input: args.input,
        groundTruth: args.groundTruth ?? null,
        requestContext: args.requestContext ?? null,
        metadata: args.metadata ?? null,
      })
      .returning();
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doUpdateItem(args: any) {
    const sets: Partial<typeof datasetItems.$inferInsert> = {};
    if (args.input !== undefined) sets.input = args.input;
    if (args.groundTruth !== undefined) sets.groundTruth = args.groundTruth;
    if (args.metadata !== undefined) sets.metadata = args.metadata;

    const [row] = await this.db
      .update(datasetItems)
      .set(sets)
      .where(sql`${datasetItems.id} = ${args.id} AND ${datasetItems.datasetVersion} = ${args.datasetVersion ?? 0}`)
      .returning();
    return row as never;
  }

  async _doDeleteItem(args: { id: string; datasetId: string }) {
    await this.db
      .delete(datasetItems)
      .where(sql`${datasetItems.id} = ${args.id} AND ${datasetItems.datasetId} = ${args.datasetId}`);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async listItems(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(datasetItems)
      .where(eq(datasetItems.datasetId, args.datasetId));
    const total = countRow?.count ?? 0;

    const rows = await this.db
      .select()
      .from(datasetItems)
      .where(eq(datasetItems.datasetId, args.datasetId))
      .orderBy(desc(datasetItems.createdAt))
      .limit(perPage)
      .offset(page * perPage);

    return { items: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async getItemById(args: any) {
    if (args.datasetVersion != null) {
      const [row] = await this.db
        .select()
        .from(datasetItems)
        .where(sql`${datasetItems.id} = ${args.id} AND ${datasetItems.datasetVersion} = ${args.datasetVersion}`);
      return (row as never) ?? null;
    }
    const [row] = await this.db
      .select()
      .from(datasetItems)
      .where(eq(datasetItems.id, args.id))
      .orderBy(desc(datasetItems.datasetVersion))
      .limit(1);
    return (row as never) ?? null;
  }

  async getItemsByVersion(args: { datasetId: string; version: number }) {
    const rows = await this.db
      .select()
      .from(datasetItems)
      .where(sql`${datasetItems.datasetId} = ${args.datasetId} AND ${datasetItems.datasetVersion} = ${args.version}`);
    return rows as never;
  }

  async getItemHistory(itemId: string) {
    const rows = await this.db
      .select()
      .from(datasetItems)
      .where(eq(datasetItems.id, itemId))
      .orderBy(desc(datasetItems.datasetVersion));
    return rows as never;
  }

  async createDatasetVersion(datasetId: string, version: number) {
    const id = crypto.randomUUID();
    const [row] = await this.db.insert(datasetVersions).values({ id, datasetId, version }).returning();
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async listDatasetVersions(input: any) {
    const rows = await this.db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.datasetId, input.datasetId))
      .orderBy(desc(datasetVersions.version));
    return { versions: rows, total: rows.length, page: 0, perPage: false, hasMore: false } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doBatchInsertItems(input: any) {
    const items = input.items ?? [];
    if (items.length === 0) return [] as never;

    await this.db.transaction(async (tx) => {
      for (const item of items) {
        const id = item.id ?? crypto.randomUUID();
        await tx.insert(datasetItems).values({
          id,
          datasetId: input.datasetId,
          datasetVersion: input.datasetVersion ?? 0,
          isDeleted: false,
          input: item.input,
          groundTruth: item.groundTruth ?? null,
          requestContext: item.requestContext ?? null,
          metadata: item.metadata ?? null,
        });
      }
    });

    const rows = await this.db
      .select()
      .from(datasetItems)
      .where(
        sql`${datasetItems.datasetId} = ${input.datasetId} AND ${datasetItems.datasetVersion} = ${input.datasetVersion ?? 0}`,
      )
      .orderBy(desc(datasetItems.createdAt))
      .limit(items.length);
    return rows as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doBatchDeleteItems(input: any) {
    const itemIds = input.itemIds ?? [];
    if (itemIds.length === 0) return;
    await this.db
      .delete(datasetItems)
      .where(and(inArray(datasetItems.id, itemIds), eq(datasetItems.datasetId, input.datasetId)));
  }
}
