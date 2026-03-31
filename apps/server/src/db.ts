import { createDb } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import postgres from 'postgres';

const log = createAppLogger('postgres');
const connectionString = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

export const sql = postgres(connectionString, {
  onnotice: (notice) => {
    log.debug(notice.message, { code: notice.code });
  },
});
export const db = createDb(sql);
