import { createConnection } from '../../connection';

export const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

/** Create a test database connection returning both Drizzle `db` and raw `sql`. */
export function createTestConnection() {
  return createConnection(TEST_DB_URL);
}
