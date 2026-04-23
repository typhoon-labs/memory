import { inArray } from 'drizzle-orm';
import type { Db } from '../client';
import { syncTargets } from '../schema/sync-target';

/** Batch-resolve sync target IDs to names. */
export async function getSyncTargetNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: syncTargets.id, name: syncTargets.name })
    .from(syncTargets)
    .where(inArray(syncTargets.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
