import type { Db } from '@typhoon/db';
import type { Sql } from 'postgres';

interface BaseConfig {
  id: string;
  tablePrefix?: string;
}

interface ConnectionStringConfig extends BaseConfig {
  connectionString: string;
}

interface SharedConnectionConfig extends BaseConfig {
  db: Db;
  sql: Sql;
}

export type PostgresStoreConfig = ConnectionStringConfig | SharedConnectionConfig;

interface SharedSqlConfig extends BaseConfig {
  sql: Sql;
}

export type PgVectorConfig = ConnectionStringConfig | SharedSqlConfig;

export function hasConnectionString(config: PostgresStoreConfig | PgVectorConfig): config is ConnectionStringConfig {
  return 'connectionString' in config;
}
