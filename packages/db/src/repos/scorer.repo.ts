import { sql } from 'drizzle-orm';

import type { Db } from '../client';

/** Data-access layer for scorer definition queries (JOINs with sub-selects). */
export class ScorerRepo {
  constructor(private db: Db) {}

  /**
   * List scorer definitions joined with their active (or latest) version,
   * with optional status filter and pagination.
   */
  async listWithLatestVersion(page: number, perPage: number, status?: string): Promise<Array<Record<string, unknown>>> {
    const validStatuses = ['draft', 'active', 'archived'];
    const hasStatusFilter = status && validStatuses.includes(status);

    const statusClause = hasStatusFilter ? sql`WHERE d.status = ${status}` : sql``;

    const rows = await this.db.execute(sql`
      SELECT d.*, v.name, v.description, v.type, v.model, v.instructions,
             v.score_range, v.preset_config, v.default_sampling, v.version_number,
             v.change_message
      FROM scorer_definitions d
      LEFT JOIN scorer_definition_versions v
        ON v.id = COALESCE(
          d.active_version_id,
          (SELECT id FROM scorer_definition_versions
           WHERE scorer_definition_id = d.id
           ORDER BY version_number DESC LIMIT 1)
        )
      ${statusClause}
      ORDER BY d.updated_at DESC
      LIMIT ${perPage} OFFSET ${page * perPage}
    `);
    return rows as unknown as Array<Record<string, unknown>>;
  }

  /** Count scorer definitions, optionally filtered by status. */
  async countByStatus(status?: string): Promise<number> {
    const validStatuses = ['draft', 'active', 'archived'];
    const hasStatusFilter = status && validStatuses.includes(status);

    const statusClause = hasStatusFilter ? sql`WHERE d.status = ${status}` : sql``;

    const rows = await this.db.execute(sql`SELECT COUNT(*)::int AS count FROM scorer_definitions d ${statusClause}`);
    const row = rows[0] as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /** Find a single scorer definition joined with its active version. */
  async findByIdWithVersion(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.execute(sql`
      SELECT d.*, v.name, v.description, v.type, v.model, v.instructions,
             v.score_range, v.preset_config, v.default_sampling, v.version_number,
             v.change_message
      FROM scorer_definitions d
      LEFT JOIN scorer_definition_versions v ON v.id = d.active_version_id
      WHERE d.id = ${id}
    `);
    const row = rows[0];
    return (row as unknown as Record<string, unknown>) ?? null;
  }

  /**
   * List all published (active) scorer definitions with their active versions.
   * Equivalent to the PUBLISHED_SCORERS_QUERY in scorer-loader.ts.
   */
  async listPublished(): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.execute(sql`
      SELECT
        d.id,
        v.name,
        v.type,
        v.description,
        v.model,
        v.instructions,
        v.score_range,
        v.preset_config,
        v.default_sampling
      FROM scorer_definitions d
      JOIN scorer_definition_versions v ON v.id = d.active_version_id
      WHERE d.status = 'active'
      ORDER BY v.name ASC
    `);
    return rows as unknown as Array<Record<string, unknown>>;
  }
}
