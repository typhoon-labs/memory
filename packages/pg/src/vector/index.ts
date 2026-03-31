import type {
  CreateIndexParams,
  DeleteIndexParams,
  DeleteVectorParams,
  DeleteVectorsParams,
  DescribeIndexParams,
  IndexStats,
  QueryResult,
  QueryVectorParams,
  UpdateVectorParams,
  UpsertVectorParams,
} from '@mastra/core/vector';
import { MastraVector } from '@mastra/core/vector';
import type { Sql } from 'postgres';
import type { PgVectorConfig } from '../config.js';
import { resolveSqlConnection } from '../connection.js';
import { buildFilterQuery, type PGVectorFilter, type SqlParam } from './filter.js';

export class PgVector extends MastraVector<PGVectorFilter> {
  private sql: Sql;
  private owned: boolean;
  private tablePrefix: string;

  constructor(config: PgVectorConfig) {
    super({ id: config.id });
    const resolved = resolveSqlConnection(config);
    this.sql = resolved.sql;
    this.owned = resolved.owned;
    this.tablePrefix = config.tablePrefix ?? '';
  }

  private tableName(indexName: string): string {
    return this.tablePrefix ? `${this.tablePrefix}_${indexName}` : indexName;
  }

  async createIndex(params: CreateIndexParams & { metric?: string }): Promise<void> {
    const table = this.tableName(params.indexName);
    const dimension = params.dimension;
    const metric = params.metric ?? 'cosine';

    await this.sql`CREATE EXTENSION IF NOT EXISTS vector`;

    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        embedding vector(${dimension}),
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);

    const opsClass =
      metric === 'euclidean' ? 'vector_l2_ops' : metric === 'dotproduct' ? 'vector_ip_ops' : 'vector_cosine_ops';

    await this.sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "${table}_embedding_idx"
      ON "${table}" USING hnsw (embedding ${opsClass})
    `);
  }

  async query(params: QueryVectorParams<PGVectorFilter> & { minScore?: number }): Promise<QueryResult[]> {
    const table = this.tableName(params.indexName);
    const topK = params.topK ?? 10;
    const includeVector = params.includeVector ?? false;
    const minScore = params.minScore ?? 0;

    const vectorSelect = includeVector ? ', embedding' : '';

    let whereClause = '';
    let filterValues: SqlParam[] = [];

    if (!params.queryVector) {
      // Metadata-only query — params start at $1
      if (params.filter && Object.keys(params.filter).length > 0) {
        const filterResult = buildFilterQuery(params.filter, 1);
        if (filterResult.sql) {
          whereClause = `WHERE ${filterResult.sql}`;
          filterValues = filterResult.values;
        }
      }
      const rows = await this.sql.unsafe(
        `SELECT id, metadata${vectorSelect}, 0::float AS score
         FROM "${table}"
         ${whereClause}
         LIMIT ${topK}`,
        filterValues as (string | number | null)[],
      );
      return rows.map((row: Record<string, unknown>) => this.mapRow(row, includeVector));
    }

    // Vector query — $1 is the query vector, filters start at $2
    if (params.filter && Object.keys(params.filter).length > 0) {
      const filterResult = buildFilterQuery(params.filter, 2);
      if (filterResult.sql) {
        whereClause = `WHERE ${filterResult.sql}`;
        filterValues = filterResult.values;
      }
    }

    const vecStr = `[${params.queryVector.join(',')}]`;

    let scoreWhereClause = '';
    const allValues: (string | number | boolean | null)[] = [vecStr, ...filterValues];
    if (minScore > 0) {
      allValues.push(minScore);
      const scoreCondition = `1 - (embedding <=> $1::vector) >= $${allValues.length}`;
      scoreWhereClause = whereClause ? `${whereClause} AND ${scoreCondition}` : `WHERE ${scoreCondition}`;
    } else {
      scoreWhereClause = whereClause;
    }

    allValues.push(topK);
    const rows = await this.sql.unsafe(
      `SELECT id, metadata${vectorSelect},
              1 - (embedding <=> $1::vector) AS score
       FROM "${table}"
       ${scoreWhereClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $${allValues.length}`,
      allValues,
    );

    return rows.map((row: Record<string, unknown>) => this.mapRow(row, includeVector));
  }

  async upsert(params: UpsertVectorParams): Promise<string[]> {
    const table = this.tableName(params.indexName);
    const ids: string[] = [];
    const values: (string | number | null)[] = [];
    const rows: string[] = [];

    for (let i = 0; i < params.vectors.length; i++) {
      const id = params.ids?.[i] ?? crypto.randomUUID();
      const vector = params.vectors[i] as number[];
      const metadata = params.metadata?.[i] ?? {};
      const vecStr = `[${vector.join(',')}]`;
      const base = i * 3;
      rows.push(`($${base + 1}, $${base + 2}::vector, $${base + 3}::jsonb)`);
      values.push(id, vecStr, JSON.stringify(metadata));
      ids.push(id);
    }

    if (rows.length > 0) {
      await this.sql.unsafe(
        `INSERT INTO "${table}" (id, embedding, metadata) VALUES ${rows.join(', ')}
         ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata`,
        values,
      );
    }

    return ids;
  }

  async updateVector(params: UpdateVectorParams<PGVectorFilter>): Promise<void> {
    const table = this.tableName(params.indexName);

    if (params.id) {
      if (params.update.metadata && params.update.vector) {
        const vecStr = `[${params.update.vector.join(',')}]`;
        await this
          .sql`UPDATE ${this.sql(table)} SET metadata = ${this.sql.json(params.update.metadata)}, embedding = ${vecStr}::vector WHERE id = ${params.id}`;
      } else if (params.update.metadata) {
        await this
          .sql`UPDATE ${this.sql(table)} SET metadata = ${this.sql.json(params.update.metadata)} WHERE id = ${params.id}`;
      } else if (params.update.vector) {
        const vecStr = `[${params.update.vector.join(',')}]`;
        await this.sql.unsafe(`UPDATE "${table}" SET embedding = $1::vector WHERE id = $2`, [vecStr, params.id]);
      }
    } else if (params.filter) {
      const filterResult = buildFilterQuery(params.filter);
      if (!filterResult.sql) return;

      const sets: string[] = [];
      const values: SqlParam[] = [];
      let paramIdx = 1;

      if (params.update.metadata) {
        sets.push(`metadata = $${paramIdx}::jsonb`);
        values.push(JSON.stringify(params.update.metadata));
        paramIdx++;
      }
      if (params.update.vector) {
        sets.push(`embedding = $${paramIdx}::vector`);
        values.push(`[${params.update.vector.join(',')}]`);
        paramIdx++;
      }

      if (sets.length === 0) return;

      const reindexed = buildFilterQuery(params.filter, paramIdx);
      await this.sql.unsafe(`UPDATE "${table}" SET ${sets.join(', ')} WHERE ${reindexed.sql}`, [
        ...values,
        ...reindexed.values,
      ] as (string | number | null)[]);
    }
  }

  async deleteVector(params: DeleteVectorParams): Promise<void> {
    const table = this.tableName(params.indexName);
    await this.sql.unsafe(`DELETE FROM "${table}" WHERE id = $1`, [params.id]);
  }

  async deleteVectors(params: DeleteVectorsParams<PGVectorFilter>): Promise<void> {
    const table = this.tableName(params.indexName);

    if (params.ids && params.ids.length > 0) {
      const placeholders = params.ids.map((_, i) => `$${i + 1}`).join(', ');
      await this.sql.unsafe(`DELETE FROM "${table}" WHERE id IN (${placeholders})`, params.ids as string[]);
    } else if (params.filter) {
      const filterResult = buildFilterQuery(params.filter);
      if (filterResult.sql) {
        await this.sql.unsafe(
          `DELETE FROM "${table}" WHERE ${filterResult.sql}`,
          filterResult.values as (string | number | null)[],
        );
      }
    }
  }

  async listIndexes(): Promise<string[]> {
    const prefix = this.tablePrefix ? `${this.tablePrefix}_` : '';
    const rows = await this.sql`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'embedding'
        AND table_schema = 'public'
      ORDER BY table_name
    `;

    return rows
      .map((r: Record<string, string>) => r.table_name)
      .filter((name: string) => !prefix || name.startsWith(prefix))
      .map((name: string) => (prefix ? name.slice(prefix.length) : name));
  }

  async describeIndex(params: DescribeIndexParams): Promise<IndexStats> {
    const table = this.tableName(params.indexName);

    const [countRow] = await this.sql.unsafe(`SELECT COUNT(*)::int AS count FROM "${table}"`);

    const [dimRow] = await this.sql.unsafe(
      `SELECT atttypmod AS dimension
       FROM pg_attribute
       WHERE attrelid = $1::regclass AND attname = 'embedding'`,
      [table],
    );

    // Detect metric from HNSW index operator class
    let metric: 'cosine' | 'euclidean' | 'dotproduct' = 'cosine';
    const [opRow] = await this.sql.unsafe(
      `SELECT opcname FROM pg_opclass oc
       JOIN pg_index i ON oc.oid = ANY(i.indclass)
       JOIN pg_class c ON i.indexrelid = c.oid
       JOIN pg_am am ON am.oid = oc.opcmethod
       WHERE c.relname = $1 || '_embedding_idx' AND am.amname = 'hnsw'
       LIMIT 1`,
      [table],
    );
    if (opRow) {
      const opcname = (opRow as Record<string, string>).opcname;
      if (opcname === 'vector_l2_ops') metric = 'euclidean';
      else if (opcname === 'vector_ip_ops') metric = 'dotproduct';
    }

    return {
      dimension: Number(dimRow?.dimension ?? 0),
      count: Number(countRow?.count ?? 0),
      metric,
    };
  }

  async deleteIndex(params: DeleteIndexParams): Promise<void> {
    const table = this.tableName(params.indexName);
    await this.sql.unsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  }

  async disconnect(): Promise<void> {
    if (this.owned) {
      await this.sql.end();
    }
  }

  private mapRow(row: Record<string, unknown>, includeVector: boolean): QueryResult {
    const result: QueryResult = {
      id: row.id as string,
      score: Number(row.score ?? 0),
      metadata:
        typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : (row.metadata as Record<string, unknown> | undefined),
    };
    if (includeVector && row.embedding) {
      result.vector = this.parseVector(row.embedding);
    }
    return result;
  }

  private parseVector(raw: unknown): number[] {
    if (Array.isArray(raw)) return raw as number[];
    if (typeof raw === 'string') {
      return raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
    }
    return [];
  }
}
