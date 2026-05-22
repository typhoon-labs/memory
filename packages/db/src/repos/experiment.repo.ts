import { sql } from 'drizzle-orm';

import type { Db } from '../client';

/** Data-access layer for experiment progress queries using atomic increments. */
export class ExperimentRepo {
  constructor(private db: Db) {}

  /** Find an experiment by ID. */
  async findById(id: string) {
    const rows = await this.db.execute(sql`SELECT * FROM "experiments" WHERE id = ${id}`);
    const row = rows[0];
    if (!row) return null;
    return row as unknown as {
      id: string;
      status: string;
      dataset_id: string;
      dataset_version: number;
      total_items: number;
    };
  }

  /** Atomically increment the succeeded_count for an experiment. */
  async incrementSucceeded(id: string) {
    await this.db.execute(sql`UPDATE experiments SET succeeded_count = succeeded_count + 1 WHERE id = ${id}`);
  }

  /** Atomically increment the failed_count for an experiment. */
  async incrementFailed(id: string) {
    await this.db.execute(sql`UPDATE experiments SET failed_count = failed_count + 1 WHERE id = ${id}`);
  }
}
