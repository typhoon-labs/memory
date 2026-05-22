import type { PartitionRepo } from '@typhoon/db/repos';

/**
 * Manages daily partitions for the `ai_spans` table.
 * Called by a repeatable BullMQ job (daily at 2 AM).
 *
 * 1. Creates partitions for the next `daysAhead` days
 * 2. Drops partitions older than `retentionDays`
 */
export async function managePartitions(
  partitionRepo: PartitionRepo,
  opts: { retentionDays: number; daysAhead?: number },
): Promise<{ created: string[]; dropped: string[] }> {
  const daysAhead = opts.daysAhead ?? 7;
  const created: string[] = [];
  const dropped: string[] = [];

  // Create future partitions
  for (let d = 0; d <= daysAhead; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10).replaceAll('-', '_');
    const partitionName = `ai_spans_${dateStr}`;

    const fromDate = date.toISOString().slice(0, 10);
    const toDate = new Date(date);
    toDate.setDate(toDate.getDate() + 1);
    const toDateStr = toDate.toISOString().slice(0, 10);

    // Check if partition exists
    // oxlint-disable-next-line no-await-in-loop -- sequential DDL: check then create partitions
    const existing = await partitionRepo.exists(partitionName);

    if (!existing) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential DDL: partition creation is order-dependent
        await partitionRepo.create(partitionName, 'ai_spans', fromDate, toDateStr);
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
    const cutoffStr = cutoff.toISOString().slice(0, 10).replaceAll('-', '_');

    const partitions = await partitionRepo.listPartitions('ai_spans');

    for (const name of partitions) {
      // Extract date from partition name (ai_spans_YYYY_MM_DD)
      const match = name.match(/ai_spans_(\d{4}_\d{2}_\d{2})/);
      if (match && match[1] < cutoffStr) {
        // oxlint-disable-next-line no-await-in-loop -- sequential DDL: drop partitions one at a time
        await partitionRepo.drop(name);
        dropped.push(name);
      }
    }
  }

  return { created, dropped };
}
