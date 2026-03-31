import type { Sql } from 'postgres';

/**
 * Configuration for a versioned storage domain.
 * All 7 versioned domains (agents, promptBlocks, etc.) share this structure.
 */
export interface VersionedDomainConfig {
  /** Main entity table name (e.g., 'agents') */
  mainTable: string;
  /** Versions table name (e.g., 'agent_versions') */
  versionsTable: string;
  /** FK column name in versions table (e.g., 'agent_id') */
  entityIdColumn: string;
}

const VALID_COLUMNS = new Set([
  // Base entity columns
  'id',
  'status',
  'active_version_id',
  'author_id',
  'metadata',
  'created_at',
  'updated_at',
  // Version common columns
  'version_number',
  'name',
  'description',
  'changed_fields',
  'change_message',
  // Agent version columns
  'instructions',
  'model',
  'tools',
  'default_options',
  'workflows',
  'agents',
  'integration_tools',
  'input_processors',
  'output_processors',
  'memory',
  'scorers',
  'mcp_clients',
  'request_context_schema',
  'workspace',
  'skills',
  'skills_format',
  // Prompt block version columns
  'content',
  'rules',
  // Scorer definition version columns
  'type',
  'score_range',
  'preset_config',
  'default_sampling',
  // Workspace version columns
  'filesystem',
  'sandbox',
  'mounts',
  'search',
  'auto_sync',
  'operation_timeout',
  // Skill version columns
  'license',
  'compatibility',
  'source',
  'references',
  'scripts',
  'assets',
  'tree',
  // MCP server version columns
  'repository',
  'release_date',
  'is_latest',
  'package_canonical',
  'version',
  // MCP client version columns
  'servers',
  // FK columns
  'agent_id',
  'skill_id',
  'workspace_id',
  'prompt_block_id',
  'scorer_definition_id',
  'mcp_client_id',
  'mcp_server_id',
]);

function validateColumnName(col: string): string {
  if (!VALID_COLUMNS.has(col)) throw new Error(`Invalid column name: ${col}`);
  return col;
}

/**
 * Generic CRUD + versioning helpers for versioned storage domains.
 * All operations use raw postgres.js for simplicity since entity-specific
 * columns vary per domain but the operations are identical.
 */
export class VersionedStorageHelper {
  constructor(
    private sql: Sql,
    private config: VersionedDomainConfig,
  ) {}

  private get main() {
    return this.config.mainTable;
  }
  private get versions() {
    return this.config.versionsTable;
  }
  private get fk() {
    return this.config.entityIdColumn;
  }

  // ── Main entity CRUD ─────────────────────────────────────────────────

  async getById(id: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.sql.unsafe(`SELECT * FROM "${this.main}" WHERE id = $1`, [id]);
    return (row as Record<string, unknown>) ?? null;
  }

  async create(values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const keys = Object.keys(values);
    const cols = keys.map((k) => `"${validateColumnName(k)}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const vals = keys.map((k) => {
      const v = values[k];
      return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
    });

    const [row] = await this.sql.unsafe(
      `INSERT INTO "${this.main}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      vals as (string | number | boolean | null)[],
    );
    return row as Record<string, unknown>;
  }

  async update(id: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const keys = Object.keys(values);
    if (keys.length === 0) return (await this.getById(id))!;

    const sets = keys.map((k, i) => `"${validateColumnName(k)}" = $${i + 1}`).join(', ');
    const vals = keys.map((k) => {
      const v = values[k];
      return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
    });
    vals.push(id);

    const [row] = await this.sql.unsafe(
      `UPDATE "${this.main}" SET ${sets} WHERE id = $${vals.length} RETURNING *`,
      vals as (string | number | boolean | null)[],
    );
    return row as Record<string, unknown>;
  }

  async delete(id: string): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "${this.versions}" WHERE "${this.fk}" = $1`, [id]);
      await tx.unsafe(`DELETE FROM "${this.main}" WHERE id = $1`, [id]);
    });
  }

  async list(args?: {
    page?: number;
    perPage?: number | false;
    orderBy?: { field?: string; direction?: string };
    filter?: { authorId?: string; metadata?: Record<string, unknown> };
  }): Promise<{
    rows: Record<string, unknown>[];
    total: number;
    page: number;
    perPage: number | false;
    hasMore: boolean;
  }> {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;
    const direction = args?.orderBy?.direction === 'ASC' ? 'ASC' : 'DESC';
    const field = args?.orderBy?.field === 'updatedAt' ? 'updated_at' : 'created_at';

    const conditions: string[] = [];
    const params: (string | number | boolean | null)[] = [];

    if (args?.filter?.authorId) {
      params.push(args.filter.authorId);
      conditions.push(`"author_id" = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRow] = await this.sql.unsafe(`SELECT COUNT(*)::int AS count FROM "${this.main}" ${where}`, params);
    const total = (countRow as Record<string, number>)?.count ?? 0;

    let limitClause = '';
    if (perPage !== false) {
      limitClause = `LIMIT ${perPage} OFFSET ${page * perPage}`;
    }

    const rows = await this.sql.unsafe(
      `SELECT * FROM "${this.main}" ${where} ORDER BY "${field}" ${direction} ${limitClause}`,
      params,
    );

    return {
      rows: rows as Record<string, unknown>[],
      total,
      page,
      perPage,
      hasMore: perPage !== false && (page + 1) * perPage < total,
    };
  }

  // ── Version CRUD ──────────────────────────────────────────────────────

  async createVersion(values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const keys = Object.keys(values);
    const cols = keys.map((k) => `"${validateColumnName(k)}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const vals = keys.map((k) => {
      const v = values[k];
      return typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v;
    });

    const [row] = await this.sql.unsafe(
      `INSERT INTO "${this.versions}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      vals as (string | number | boolean | null)[],
    );
    return row as Record<string, unknown>;
  }

  async getVersion(id: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.sql.unsafe(`SELECT * FROM "${this.versions}" WHERE id = $1`, [id]);
    return (row as Record<string, unknown>) ?? null;
  }

  async getVersionByNumber(entityId: string, versionNumber: number): Promise<Record<string, unknown> | null> {
    const [row] = await this.sql.unsafe(
      `SELECT * FROM "${this.versions}" WHERE "${this.fk}" = $1 AND "version_number" = $2`,
      [entityId, versionNumber],
    );
    return (row as Record<string, unknown>) ?? null;
  }

  async getLatestVersion(entityId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.sql.unsafe(
      `SELECT * FROM "${this.versions}" WHERE "${this.fk}" = $1 ORDER BY "version_number" DESC LIMIT 1`,
      [entityId],
    );
    return (row as Record<string, unknown>) ?? null;
  }

  async listVersions(
    entityId: string,
    args?: { page?: number; perPage?: number | false; orderBy?: { field?: string; direction?: string } },
  ): Promise<{
    rows: Record<string, unknown>[];
    total: number;
    page: number;
    perPage: number | false;
    hasMore: boolean;
  }> {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 20;
    const direction = args?.orderBy?.direction === 'ASC' ? 'ASC' : 'DESC';
    const field = args?.orderBy?.field === 'createdAt' ? 'created_at' : 'version_number';

    const [countRow] = await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM "${this.versions}" WHERE "${this.fk}" = $1`,
      [entityId],
    );
    const total = (countRow as Record<string, number>)?.count ?? 0;

    let limitClause = '';
    if (perPage !== false) {
      limitClause = `LIMIT ${perPage} OFFSET ${page * perPage}`;
    }

    const rows = await this.sql.unsafe(
      `SELECT * FROM "${this.versions}" WHERE "${this.fk}" = $1 ORDER BY "${field}" ${direction} ${limitClause}`,
      [entityId],
    );

    return {
      rows: rows as Record<string, unknown>[],
      total,
      page,
      perPage,
      hasMore: perPage !== false && (page + 1) * perPage < total,
    };
  }

  async deleteVersion(id: string): Promise<void> {
    await this.sql.unsafe(`DELETE FROM "${this.versions}" WHERE id = $1`, [id]);
  }

  async deleteVersionsByParentId(entityId: string): Promise<void> {
    await this.sql.unsafe(`DELETE FROM "${this.versions}" WHERE "${this.fk}" = $1`, [entityId]);
  }

  async countVersions(entityId: string): Promise<number> {
    const [row] = await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM "${this.versions}" WHERE "${this.fk}" = $1`,
      [entityId],
    );
    return (row as Record<string, number>)?.count ?? 0;
  }

  async dangerouslyClearAll(): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "${this.versions}"`);
      await tx.unsafe(`DELETE FROM "${this.main}"`);
    });
  }
}
