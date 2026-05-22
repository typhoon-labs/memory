import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { syncTargets } from '../schema/sync-target';
import { SyncTargetRepo } from './sync-target.repo';
import { clearAllTables, createTestConnection } from './test-utils';

describe('SyncTargetRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new SyncTargetRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── deactivateOrphaned ───────────────────────────────────────────────────

  it('deactivateOrphaned deactivates config targets not in list', async () => {
    // 'a' and 'b' are config-managed, 'c' is manual (managedBy = null)
    await db.insert(syncTargets).values([
      { name: 'source-a', sourceType: 's3', config: { prefix: '' }, managedBy: 'config' },
      { name: 'source-b', sourceType: 's3', config: { prefix: '' }, managedBy: 'config' },
      { name: 'source-c', sourceType: 's3', config: { prefix: '' } },
    ]);

    await repo.deactivateOrphaned(['source-a']);

    // 'source-b' should be deactivated
    const [b] = await db.select().from(syncTargets).where(eq(syncTargets.name, 'source-b'));
    expect(b.isActive).toBe(false);

    // 'source-a' should remain active (it's in the list)
    const [a] = await db.select().from(syncTargets).where(eq(syncTargets.name, 'source-a'));
    expect(a.isActive).toBe(true);

    // 'source-c' should remain active (it's manual, not config-managed)
    const [c] = await db.select().from(syncTargets).where(eq(syncTargets.name, 'source-c'));
    expect(c.isActive).toBe(true);
  });

  it('deactivateOrphaned returns deactivated names', async () => {
    await db.insert(syncTargets).values([
      { name: 'source-a', sourceType: 's3', config: { prefix: '' }, managedBy: 'config' },
      { name: 'source-b', sourceType: 's3', config: { prefix: '' }, managedBy: 'config' },
      { name: 'source-c', sourceType: 's3', config: { prefix: '' } },
    ]);

    const deactivated = await repo.deactivateOrphaned(['source-a']);

    expect(deactivated).toEqual(['source-b']);
  });

  it('deactivateOrphaned with empty array returns empty', async () => {
    await db
      .insert(syncTargets)
      .values([{ name: 'source-a', sourceType: 's3', config: { prefix: '' }, managedBy: 'config' }]);

    const deactivated = await repo.deactivateOrphaned([]);

    // The method early-returns for empty array
    expect(deactivated).toEqual([]);

    // Verify nothing was deactivated
    const [a] = await db.select().from(syncTargets).where(eq(syncTargets.name, 'source-a'));
    expect(a.isActive).toBe(true);
  });
});
