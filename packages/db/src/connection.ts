import postgres, { type Notice, type Sql } from 'postgres';
import { createDb, type Db } from './client';

export interface DbConnection {
  db: Db;
  sql: Sql;
}

/**
 * Create a new database connection. Each call creates a fresh connection pool.
 * Use for apps that need their own connection (API, worker, scheduler).
 */
export function createConnection(
  connectionString: string,
  opts?: {
    onNotice?: (notice: Notice) => void;
  },
): DbConnection {
  const sql = postgres(connectionString, { onnotice: opts?.onNotice });
  return { db: createDb(sql), sql };
}
