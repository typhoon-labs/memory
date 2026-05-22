import { sql } from 'drizzle-orm';

import type { Db } from '../client';
import { scores } from '../schema/scores';

export class ScoreRepo {
  constructor(private db: Db) {}

  /** Check if a score already exists for the given entity and scorer. */
  async hasExistingScore(entityId: string, scorerId: string): Promise<boolean> {
    const rows = await this.db.execute(
      sql`SELECT 1 FROM "scores"
       WHERE "entity_id" = ${entityId}
         AND "entity_type" = 'message'
         AND "scorer_id" = ${scorerId}
       LIMIT 1`,
    );
    return (rows as unknown as unknown[]).length > 0;
  }

  /** Insert a score row. Keys are camelCase and match the Drizzle schema property names. */
  async saveScore(score: Record<string, unknown>): Promise<void> {
    await this.db
      .insert(scores)
      .values(score as typeof scores.$inferInsert)
      .onConflictDoNothing();
  }
}
