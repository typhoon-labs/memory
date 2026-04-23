import type { Sql } from 'postgres';
import postgres from 'postgres';
import { createDb, type Db } from '../../client';
import type { PgVectorConfig, PostgresStoreConfig } from './config';
import { hasConnectionString } from './config';

interface ResolvedStoreConnection {
  db: Db;
  sql: Sql;
  owned: boolean;
}

interface ResolvedSqlConnection {
  sql: Sql;
  owned: boolean;
}

export function resolveStoreConnection(config: PostgresStoreConfig): ResolvedStoreConnection {
  if (hasConnectionString(config)) {
    const sql = postgres(config.connectionString);
    const db = createDb(sql);
    return { db, sql, owned: true };
  }
  return { db: config.db, sql: config.sql, owned: false };
}

export function resolveSqlConnection(config: PgVectorConfig): ResolvedSqlConnection {
  if (hasConnectionString(config)) {
    const sql = postgres(config.connectionString);
    return { sql, owned: true };
  }
  return { sql: config.sql, owned: false };
}
