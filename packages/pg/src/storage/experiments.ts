import { ExperimentsStorage } from '@mastra/core/storage';
import type { Sql } from 'postgres';
import { EXPERIMENT_COLUMNS, EXPERIMENT_RESULT_COLUMNS, validateColumn } from './validate-columns.js';

export class DrizzleExperimentsStorage extends ExperimentsStorage {
  constructor(private sql: Sql) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "experiment_results"`);
      await tx.unsafe(`DELETE FROM "experiments"`);
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async createExperiment(input: any) {
    const id = input.id ?? crypto.randomUUID();
    const [row] = await this.sql.unsafe(
      `INSERT INTO "experiments" (id, name, description, metadata, dataset_id, dataset_version, target_type, target_id, status, total_items, succeeded_count, failed_count, skipped_count, created_at, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        id,
        input.name ?? null,
        input.description ?? null,
        j(input.metadata),
        input.datasetId ?? null,
        input.datasetVersion ?? null,
        input.targetType,
        input.targetId,
        input.status ?? 'pending',
        input.totalItems ?? 0,
        0,
        0,
        0,
        new Date(),
        new Date(),
      ],
    );
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async updateExperiment(input: any) {
    const sets: string[] = ['updated_at = NOW()'];
    const vals: (string | number | null)[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(input)) {
      if (k === 'id') continue;
      const col = validateColumn(
        k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        EXPERIMENT_COLUMNS,
      );
      const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      sets.push(`"${col}" = $${idx}`);
      vals.push(val as string | number | null);
      idx++;
    }
    vals.push(input.id);
    const [row] = await this.sql.unsafe(
      `UPDATE "experiments" SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    return row as never;
  }

  async getExperimentById(args: { id: string }) {
    const [row] = await this.sql.unsafe(`SELECT * FROM "experiments" WHERE id = $1`, [args.id]);
    return (row as never) ?? null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async listExperiments(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;
    const [countRow] = await this.sql.unsafe(`SELECT COUNT(*)::int AS count FROM "experiments"`);
    const total = (countRow as Record<string, number>)?.count ?? 0;
    const rows = await this.sql.unsafe(
      `SELECT * FROM "experiments" ORDER BY "created_at" DESC LIMIT ${perPage} OFFSET ${page * perPage}`,
    );
    return { experiments: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  async deleteExperiment(args: { id: string }) {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "experiment_results" WHERE "experiment_id" = $1`, [args.id]);
      await tx.unsafe(`DELETE FROM "experiments" WHERE id = $1`, [args.id]);
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async addExperimentResult(input: any) {
    const id = input.id ?? crypto.randomUUID();
    const [row] = await this.sql.unsafe(
      `INSERT INTO "experiment_results" (id, experiment_id, item_id, item_dataset_version, input, output, ground_truth, error, started_at, completed_at, retry_count, trace_id, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13) RETURNING *`,
      [
        id,
        input.experimentId,
        input.itemId,
        input.itemDatasetVersion ?? null,
        j(input.input),
        j(input.output),
        j(input.groundTruth),
        j(input.error),
        input.startedAt ?? new Date(),
        input.completedAt ?? new Date(),
        input.retryCount ?? 0,
        input.traceId ?? null,
        new Date(),
      ],
    );
    return row as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async updateExperimentResult(input: any) {
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(input)) {
      if (k === 'id') continue;
      const col = validateColumn(
        k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        EXPERIMENT_RESULT_COLUMNS,
      );
      const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      sets.push(`"${col}" = $${idx}`);
      vals.push(val as string | number | null);
      idx++;
    }
    vals.push(input.id);
    const [row] = await this.sql.unsafe(
      `UPDATE "experiment_results" SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    return row as never;
  }

  async getExperimentResultById(args: { id: string }) {
    const [row] = await this.sql.unsafe(`SELECT * FROM "experiment_results" WHERE id = $1`, [args.id]);
    return (row as never) ?? null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async listExperimentResults(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;
    const [countRow] = await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM "experiment_results" WHERE "experiment_id" = $1`,
      [args.experimentId],
    );
    const total = (countRow as Record<string, number>)?.count ?? 0;
    const rows = await this.sql.unsafe(
      `SELECT * FROM "experiment_results" WHERE "experiment_id" = $1 ORDER BY "created_at" DESC LIMIT ${perPage} OFFSET ${page * perPage}`,
      [args.experimentId],
    );
    return { results: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  async deleteExperimentResults(args: { experimentId: string }) {
    await this.sql.unsafe(`DELETE FROM "experiment_results" WHERE "experiment_id" = $1`, [args.experimentId]);
  }
}

function j(v: unknown): string | null {
  return v != null ? JSON.stringify(v) : null;
}
