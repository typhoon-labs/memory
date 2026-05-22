import { createConnection } from '@typhoon/db/connection';
import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('postgres');
const connectionString = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

export const { db, sql } = createConnection(connectionString, {
  onNotice: (notice) => {
    log.debug(notice.message, { code: notice.code });
  },
});
