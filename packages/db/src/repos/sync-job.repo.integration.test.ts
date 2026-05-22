import crypto from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { syncJobs } from '../schema/sync-job';
import { SyncJobRepo } from './sync-job.repo';
import { clearAllTables, createTestConnection, seedSyncTarget } from './test-utils';

describe('SyncJobRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new SyncJobRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── incrementCompletion ──────────────────────────────────────────────────

  it('incrementCompletion increments childJobsCompleted', async () => {
    const { id: targetId } = await seedSyncTarget(db);
    const [job] = await db
      .insert(syncJobs)
      .values({ syncTargetId: targetId, childJobsTotal: 5, status: 'running' })
      .returning();

    const result = await repo.incrementCompletion(job.id, false);

    expect(result).not.toBeNull();
    expect(result?.childJobsCompleted).toBe(1);
    expect(result?.childJobsTotal).toBe(5);
    expect(result?.status).toBe('running');

    // Verify filesErrored stayed at 0 by reading the row directly
    const [row] = await db.select().from(syncJobs);
    expect(row.filesErrored).toBe(0);
  });

  it('incrementCompletion increments filesErrored when failed=true', async () => {
    const { id: targetId } = await seedSyncTarget(db);
    const [job] = await db
      .insert(syncJobs)
      .values({ syncTargetId: targetId, childJobsTotal: 5, status: 'running' })
      .returning();

    const result = await repo.incrementCompletion(job.id, true);

    expect(result).not.toBeNull();
    expect(result?.childJobsCompleted).toBe(1);

    // Verify filesErrored was also incremented
    const [row] = await db.select().from(syncJobs);
    expect(row.filesErrored).toBe(1);
  });

  it('incrementCompletion returns null for nonexistent job', async () => {
    const result = await repo.incrementCompletion(crypto.randomUUID(), false);

    expect(result).toBeNull();
  });
});
