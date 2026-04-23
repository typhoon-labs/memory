/** Minimal SQL interface compatible with postgres.js Sql. */
interface SqlClient {
  unsafe: (query: string) => Promise<unknown[]>;
  // biome-ignore lint/suspicious/noExplicitAny: Tagged template literal
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>;
}

/**
 * Manages daily partitions for the `ai_spans` table.
 * Called by a repeatable BullMQ job (daily at 2 AM).
 *
 * 1. Creates partitions for the next `daysAhead` days
 * 2. Drops partitions older than `retentionDays`
 */
export async function managePartitions(
  sql: SqlClient,
  opts: { retentionDays: number; daysAhead?: number },
): Promise<{ created: string[]; dropped: string[] }> {
  const daysAhead = opts.daysAhead ?? 7;
  const created: string[] = [];
  const dropped: string[] = [];

  // Create future partitions
  for (let d = 0; d <= daysAhead; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '_');
    const partitionName = `ai_spans_${dateStr}`;

    const fromDate = date.toISOString().slice(0, 10);
    const toDate = new Date(date);
    toDate.setDate(toDate.getDate() + 1);
    const toDateStr = toDate.toISOString().slice(0, 10);

    // Check if partition exists
    const [existing] = await sql`
      SELECT 1 FROM pg_tables WHERE tablename = ${partitionName}
    `;

    if (!existing) {
      try {
        await sql.unsafe(
          `CREATE TABLE IF NOT EXISTS "${partitionName}" PARTITION OF ai_spans
           FOR VALUES FROM ('${fromDate}') TO ('${toDateStr}')`,
        );
        created.push(partitionName);
      } catch {
        // Partition may already exist from a concurrent run — safe to ignore
      }
    }
  }

  // Drop expired partitions
  if (opts.retentionDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - opts.retentionDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '_');

    const partitions = await sql`
      SELECT inhrelid::regclass::text AS partition_name
      FROM pg_inherits
      WHERE inhparent = 'ai_spans'::regclass
    `;

    for (const row of partitions) {
      const name = row.partition_name as string;
      // Extract date from partition name (ai_spans_YYYY_MM_DD)
      const match = name.match(/ai_spans_(\d{4}_\d{2}_\d{2})/);
      if (match && match[1] < cutoffStr) {
        await sql.unsafe(`DROP TABLE IF EXISTS "${name}"`);
        dropped.push(name);
      }
    }
  }

  return { created, dropped };
}
