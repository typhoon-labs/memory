import { DatasetsStorage } from '@mastra/core/storage';
import type { Sql } from 'postgres';
import { DATASET_COLUMNS, validateColumn } from './validate-columns.js';

/**
 * Datasets storage using raw SQL for SCD-2 versioned items.
 */
export class DrizzleDatasetsStorage extends DatasetsStorage {
  constructor(private sql: Sql) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "dataset_items"`);
      await tx.unsafe(`DELETE FROM "dataset_versions"`);
      await tx.unsafe(`DELETE FROM "datasets"`);
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra dataset types
  async createDataset(input: any) {
    const id = input.id ?? crypto.randomUUID();
    const [row] = await this.sql.unsafe(
      `INSERT INTO "datasets" (id, name, description, metadata, input_schema, ground_truth_schema, request_context_schema, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10) RETURNING *`,
      [
        id,
        input.name,
        input.description ?? null,
        j(input.metadata),
        j(input.inputSchema),
        j(input.groundTruthSchema),
        j(input.requestContextSchema),
        input.version ?? 0,
        new Date(),
        new Date(),
      ],
    );
    return row as never;
  }

  async getDatasetById(args: { id: string }) {
    const [row] = await this.sql.unsafe(`SELECT * FROM "datasets" WHERE id = $1`, [args.id]);
    return (row as never) ?? null;
  }

  async deleteDataset(args: { id: string }) {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "dataset_items" WHERE "dataset_id" = $1`, [args.id]);
      await tx.unsafe(`DELETE FROM "dataset_versions" WHERE "dataset_id" = $1`, [args.id]);
      await tx.unsafe(`DELETE FROM "datasets" WHERE id = $1`, [args.id]);
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra list types
  async listDatasets(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;
    const [countRow] = await this.sql.unsafe(`SELECT COUNT(*)::int AS count FROM "datasets"`);
    const total = (countRow as Record<string, number>)?.count ?? 0;
    const rows = await this.sql.unsafe(
      `SELECT * FROM "datasets" ORDER BY "created_at" DESC LIMIT ${perPage} OFFSET ${page * perPage}`,
    );
    return { datasets: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doUpdateDataset(args: any) {
    const sets: string[] = ['updated_at = NOW()'];
    const vals: (string | number | null)[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(args)) {
      if (k === 'id') continue;
      const col = validateColumn(
        k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        DATASET_COLUMNS,
      );
      const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      sets.push(`"${col}" = $${idx}`);
      vals.push(val as string | number | null);
      idx++;
    }
    vals.push(args.id);
    const [row] = await this.sql.unsafe(
      `UPDATE "datasets" SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doAddItem(args: any) {
    const id = args.id ?? crypto.randomUUID();
    const [row] = await this.sql.unsafe(
      `INSERT INTO "dataset_items" (id, dataset_id, dataset_version, is_deleted, input, ground_truth, request_context, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, false, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9) RETURNING *`,
      [
        id,
        args.datasetId,
        args.datasetVersion ?? 0,
        j(args.input),
        j(args.groundTruth),
        j(args.requestContext),
        j(args.metadata),
        new Date(),
        new Date(),
      ],
    );
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doUpdateItem(args: any) {
    const [row] = await this.sql.unsafe(
      `UPDATE "dataset_items" SET input = COALESCE($1::jsonb, input), ground_truth = COALESCE($2::jsonb, ground_truth), metadata = COALESCE($3::jsonb, metadata), updated_at = NOW()
       WHERE id = $4 AND dataset_version = $5 RETURNING *`,
      [j(args.input), j(args.groundTruth), j(args.metadata), args.id, args.datasetVersion ?? 0],
    );
    return row as never;
  }

  async _doDeleteItem(args: { id: string; datasetId: string }) {
    await this.sql.unsafe(`DELETE FROM "dataset_items" WHERE id = $1 AND "dataset_id" = $2`, [args.id, args.datasetId]);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async listItems(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;
    const [countRow] = await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM "dataset_items" WHERE "dataset_id" = $1`,
      [args.datasetId],
    );
    const total = (countRow as Record<string, number>)?.count ?? 0;
    const rows = await this.sql.unsafe(
      `SELECT * FROM "dataset_items" WHERE "dataset_id" = $1 ORDER BY "created_at" DESC LIMIT ${perPage} OFFSET ${page * perPage}`,
      [args.datasetId],
    );
    return { items: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async getItemById(args: any) {
    const version = args.datasetVersion;
    const q =
      version != null
        ? `SELECT * FROM "dataset_items" WHERE id = $1 AND "dataset_version" = $2`
        : `SELECT * FROM "dataset_items" WHERE id = $1 ORDER BY "dataset_version" DESC LIMIT 1`;
    const params = version != null ? [args.id, version] : [args.id];
    const [row] = await this.sql.unsafe(q, params as (string | number)[]);
    return (row as never) ?? null;
  }

  async getItemsByVersion(args: { datasetId: string; version: number }) {
    const rows = await this.sql.unsafe(
      `SELECT * FROM "dataset_items" WHERE "dataset_id" = $1 AND "dataset_version" = $2`,
      [args.datasetId, args.version],
    );
    return rows as never;
  }

  async getItemHistory(itemId: string) {
    const rows = await this.sql.unsafe(`SELECT * FROM "dataset_items" WHERE id = $1 ORDER BY "dataset_version" DESC`, [
      itemId,
    ]);
    return rows as never;
  }

  async createDatasetVersion(datasetId: string, version: number) {
    const id = crypto.randomUUID();
    const [row] = await this.sql.unsafe(
      `INSERT INTO "dataset_versions" (id, dataset_id, version, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, datasetId, version, new Date()],
    );
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async listDatasetVersions(input: any) {
    const rows = await this.sql.unsafe(
      `SELECT * FROM "dataset_versions" WHERE "dataset_id" = $1 ORDER BY version DESC`,
      [input.datasetId],
    );
    return { versions: rows, total: rows.length, page: 0, perPage: false, hasMore: false } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doBatchInsertItems(input: any) {
    const items = input.items ?? [];
    if (items.length === 0) return [] as never;

    await this.sql.begin(async (tx) => {
      for (const item of items) {
        const id = item.id ?? crypto.randomUUID();
        await tx.unsafe(
          `INSERT INTO "dataset_items" (id, dataset_id, dataset_version, is_deleted, input, ground_truth, request_context, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, false, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9) RETURNING *`,
          [
            id,
            input.datasetId,
            input.datasetVersion ?? 0,
            j(item.input),
            j(item.groundTruth),
            j(item.requestContext),
            j(item.metadata),
            new Date(),
            new Date(),
          ],
        );
      }
    });

    // Return inserted items
    const rows = await this.sql.unsafe(
      `SELECT * FROM "dataset_items" WHERE "dataset_id" = $1 AND "dataset_version" = $2 ORDER BY "created_at" DESC LIMIT ${items.length}`,
      [input.datasetId, input.datasetVersion ?? 0],
    );
    return rows as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async _doBatchDeleteItems(input: any) {
    const itemIds = input.itemIds ?? [];
    if (itemIds.length === 0) return;
    const placeholders = itemIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
    await this.sql.unsafe(
      `DELETE FROM "dataset_items" WHERE id IN (${placeholders}) AND "dataset_id" = $${itemIds.length + 1}`,
      [...itemIds, input.datasetId] as string[],
    );
  }
}

function j(v: unknown): string | null {
  return v != null ? JSON.stringify(v) : null;
}
