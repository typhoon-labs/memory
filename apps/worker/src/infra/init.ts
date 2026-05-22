import { EMBEDDING_DIMENSION } from '@typhoon/ai';
import { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import type { Sql } from 'postgres';

const log = createAppLogger('init');

/**
 * Initialize the PgVector knowledge_base index if it doesn't exist.
 * Idempotent — safe to call from multiple processes.
 */
export async function initVectorIndex(sqlClient: Sql): Promise<void> {
  const pgVector = new PgVector({ id: 'typhoon-vectors', sql: sqlClient });
  try {
    await pgVector.createIndex({
      indexName: 'knowledge_base',
      dimension: EMBEDDING_DIMENSION,
      indexConfig: {
        type: 'hnsw',
        hnsw: { m: 16, efConstruction: 64 },
      },
    });
    log.info('Vector index ready', { index: 'knowledge_base' });
  } catch (error) {
    // Index may already exist — that's fine
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists')) {
      log.debug('Vector index already exists', { index: 'knowledge_base' });
    } else {
      throw error;
    }
  }

  // Backfill tsvector for rows that predate hybrid search support.
  // The trigger handles all future inserts/updates, so this only matters once.
  const backfilled = await sqlClient
    .unsafe(
      `UPDATE "knowledge_base" SET content_tsvector = to_tsvector('english', COALESCE(metadata->>'text', ''))
       WHERE content_tsvector IS NULL`,
    )
    .catch(() => ({ count: 0 }));
  const backfillCount = 'count' in backfilled ? Number(backfilled.count) : 0;
  if (backfillCount > 0) log.info('Backfilled tsvector', { rows: backfillCount });
}
