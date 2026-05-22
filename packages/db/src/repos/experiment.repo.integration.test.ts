import { sql as dsql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { experiments } from '../schema/experiments';
import { ExperimentRepo } from './experiment.repo';
import { clearAllTables, createTestConnection } from './test-utils';

describe('ExperimentRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new ExperimentRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── incrementSucceeded ───────────────────────────────────────────────────

  it('incrementSucceeded atomically increments', async () => {
    const [exp] = await db
      .insert(experiments)
      .values({ targetType: 'agent', targetId: 'test-agent', status: 'running', totalItems: 5 })
      .returning();

    await repo.incrementSucceeded(exp.id);
    await repo.incrementSucceeded(exp.id);

    const rows = await db.execute(dsql`SELECT succeeded_count FROM experiments WHERE id = ${exp.id}`);
    expect(Number(rows[0].succeeded_count)).toBe(2);
  });

  // ── incrementFailed ──────────────────────────────────────────────────────

  it('incrementFailed atomically increments', async () => {
    const [exp] = await db
      .insert(experiments)
      .values({ targetType: 'agent', targetId: 'test-agent', status: 'running', totalItems: 5 })
      .returning();

    await repo.incrementFailed(exp.id);
    await repo.incrementFailed(exp.id);

    const rows = await db.execute(dsql`SELECT failed_count FROM experiments WHERE id = ${exp.id}`);
    expect(Number(rows[0].failed_count)).toBe(2);
  });

  // ── findById ─────────────────────────────────────────────────────────────

  it('findById returns full row', async () => {
    const [exp] = await db
      .insert(experiments)
      .values({ targetType: 'agent', targetId: 'test-agent', status: 'running', totalItems: 5 })
      .returning();

    const result = await repo.findById(exp.id);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(exp.id);
    expect(result?.status).toBe('running');
    expect(result?.total_items).toBe(5);
  });
});
