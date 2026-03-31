import { ScoresStorage } from '@mastra/core/storage';
import type { Sql } from 'postgres';
import { SCORE_COLUMNS, validateColumn } from './validate-columns.js';

export class DrizzleScoresStorage extends ScoresStorage {
  constructor(private sql: Sql) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.sql.unsafe(`DELETE FROM "scores"`);
  }

  async getScoreById(args: { id: string }) {
    const [row] = await this.sql.unsafe(`SELECT * FROM "scores" WHERE id = $1`, [args.id]);
    return (row as never) ?? null;
  }

  async saveScore(score: Record<string, unknown>) {
    const id = (score.id as string) ?? crypto.randomUUID();
    const keys = Object.keys(score);
    const cols = keys.map((k) => `"${validateColumn(this.toSnake(k), SCORE_COLUMNS)}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const vals = keys.map((k) => {
      const v = score[k];
      return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
    });

    const [row] = await this.sql.unsafe(
      `INSERT INTO "scores" (${cols}) VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${keys.map((k, i) => `"${validateColumn(this.toSnake(k), SCORE_COLUMNS)}" = $${i + 1}`).join(', ')}
       RETURNING *`,
      vals as (string | number | boolean | null)[],
    );
    return { score: row } as never;
  }

  async listScoresByScorerId(args: {
    scorerId: string;
    pagination: { page: number; perPage: number };
    entityId?: string;
    entityType?: string;
  }) {
    return this.listScores(`"scorer_id" = $1`, [args.scorerId], args.pagination);
  }

  async listScoresByRunId(args: { runId: string; pagination: { page: number; perPage: number } }) {
    return this.listScores(`"run_id" = $1`, [args.runId], args.pagination);
  }

  async listScoresByEntityId(args: {
    entityId: string;
    entityType: string;
    pagination: { page: number; perPage: number };
  }) {
    return this.listScores(
      `"entity_id" = $1 AND "entity_type" = $2`,
      [args.entityId, args.entityType],
      args.pagination,
    );
  }

  private async listScores(
    where: string,
    params: (string | number | null)[],
    pagination: { page: number; perPage: number },
  ) {
    const [countRow] = await this.sql.unsafe(`SELECT COUNT(*)::int AS count FROM "scores" WHERE ${where}`, params);
    const total = (countRow as Record<string, number>)?.count ?? 0;
    const offset = pagination.page * pagination.perPage;

    const limitParams = [...params, pagination.perPage, offset];
    const rows = await this.sql.unsafe(
      `SELECT * FROM "scores" WHERE ${where} ORDER BY "created_at" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      limitParams,
    );

    return {
      scores: rows as never[],
      total,
      page: pagination.page,
      perPage: pagination.perPage,
      hasMore: (pagination.page + 1) * pagination.perPage < total,
    } as never;
  }

  private toSnake(key: string): string {
    return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  }
}
