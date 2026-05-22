import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import postgres from 'postgres';

import * as schema from './schema/index';

export function createDb(sqlOrConnectionString: Sql | string) {
  const sql = typeof sqlOrConnectionString === 'string' ? postgres(sqlOrConnectionString) : sqlOrConnectionString;
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
