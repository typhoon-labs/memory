import { sql } from 'drizzle-orm';

import type { Db } from '../client';

/**
 * Data-access layer for PostgreSQL table partitioning DDL operations.
 * Used by the partition-management job to create/drop daily partitions.
 */
export class PartitionRepo {
  constructor(private db: Db) {}

  /** Check whether a partition table exists by name. */
  async exists(partitionName: string): Promise<boolean> {
    const rows = await this.db.execute(sql`SELECT 1 FROM pg_tables WHERE tablename = ${partitionName}`);
    return (rows as unknown[]).length > 0;
  }

  /**
   * Create a range partition of a parent table for the given date range.
   * Uses `CREATE TABLE IF NOT EXISTS` so concurrent calls are safe.
   *
   * NOTE: DDL statements cannot use parameterized queries for identifiers,
   * so `sql.raw()` is used. The values are generated internally (date strings),
   * not from user input.
   */
  async create(partitionName: string, parentTable: string, fromDate: string, toDate: string): Promise<void> {
    await this.db.execute(
      sql`CREATE TABLE IF NOT EXISTS ${sql.raw(`"${partitionName}"`)} PARTITION OF ${sql.raw(`"${parentTable}"`)}
          FOR VALUES FROM (${fromDate}) TO (${toDate})`,
    );
  }

  /** List all child partitions of a parent table. */
  async listPartitions(parentTable: string): Promise<string[]> {
    const rows = await this.db.execute(
      sql`SELECT inhrelid::regclass::text AS partition_name
          FROM pg_inherits
          WHERE inhparent = ${sql.raw(`'${parentTable}'`)}::regclass`,
    );
    return (rows as unknown as Array<{ partition_name: string }>).map((r) => r.partition_name);
  }

  /** Drop a partition table if it exists. */
  async drop(partitionName: string): Promise<void> {
    await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(`"${partitionName}"`)}`);
  }
}
