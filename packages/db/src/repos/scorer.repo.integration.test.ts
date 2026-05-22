import crypto from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { scorerDefinitionVersions } from '../schema/versioned/scorer-definitions';
import { ScorerRepo } from './scorer.repo';
import { clearAllTables, createTestConnection, seedScorerDefinition } from './test-utils';

describe('ScorerRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new ScorerRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. listWithLatestVersion with active version set ────────────────

  it('listWithLatestVersion returns definition joined with active version', async () => {
    const scorer = await seedScorerDefinition(db, { name: 'Accuracy', type: 'faithfulness', status: 'active' });

    const rows = await repo.listWithLatestVersion(0, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(scorer.id);
    expect(rows[0].name).toBe('Accuracy');
    expect(rows[0].type).toBe('faithfulness');
    expect(rows[0].version_number).toBe(1);
  });

  // ── 2. listWithLatestVersion COALESCE fallback ──────────────────────

  it('listWithLatestVersion falls back to latest version when active_version_id is NULL', async () => {
    const scorer = await seedScorerDefinition(db, {
      name: 'v1',
      type: 'faithfulness',
      setActiveVersion: false,
    });

    // Add versions 2 and 3 — the COALESCE subquery should pick version 3
    await db.insert(scorerDefinitionVersions).values({
      id: crypto.randomUUID(),
      scorerDefinitionId: scorer.id,
      versionNumber: 2,
      name: 'v2',
      type: 'faithfulness',
    });
    await db.insert(scorerDefinitionVersions).values({
      id: crypto.randomUUID(),
      scorerDefinitionId: scorer.id,
      versionNumber: 3,
      name: 'v3',
      type: 'faithfulness',
    });

    const rows = await repo.listWithLatestVersion(0, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(scorer.id);
    expect(rows[0].name).toBe('v3');
    expect(rows[0].version_number).toBe(3);
  });

  // ── 3. listWithLatestVersion with status filter ─────────────────────

  it('listWithLatestVersion filters by status', async () => {
    await seedScorerDefinition(db, { name: 'Active Scorer', status: 'active' });
    await seedScorerDefinition(db, { name: 'Draft Scorer', status: 'draft' });
    await seedScorerDefinition(db, { name: 'Archived Scorer', status: 'archived' });

    const activeRows = await repo.listWithLatestVersion(0, 10, 'active');
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].name).toBe('Active Scorer');

    const draftRows = await repo.listWithLatestVersion(0, 10, 'draft');
    expect(draftRows).toHaveLength(1);
    expect(draftRows[0].name).toBe('Draft Scorer');

    // No filter returns all
    const allRows = await repo.listWithLatestVersion(0, 10);
    expect(allRows).toHaveLength(3);

    // Also verify countByStatus agrees
    expect(await repo.countByStatus('active')).toBe(1);
    expect(await repo.countByStatus('draft')).toBe(1);
    expect(await repo.countByStatus('archived')).toBe(1);
    expect(await repo.countByStatus()).toBe(3);
  });

  // ── 4. listWithLatestVersion pagination ─────────────────────────────

  it('listWithLatestVersion paginates correctly', async () => {
    // Seed 5 scorers
    await Promise.all(Array.from({ length: 5 }, (_, i) => seedScorerDefinition(db, { name: `Scorer ${i}` })));

    const page0 = await repo.listWithLatestVersion(0, 2);
    expect(page0).toHaveLength(2);

    const page1 = await repo.listWithLatestVersion(1, 2);
    expect(page1).toHaveLength(2);

    const page2 = await repo.listWithLatestVersion(2, 2);
    expect(page2).toHaveLength(1);

    // All IDs should be unique across pages
    const allIds = [...page0, ...page1, ...page2].map((r) => r.id);
    expect(new Set(allIds).size).toBe(5);
  });

  // ── 5. findByIdWithVersion returns null for non-existent ────────────

  it('findByIdWithVersion returns null for non-existent ID', async () => {
    const result = await repo.findByIdWithVersion(crypto.randomUUID());
    expect(result).toBeNull();
  });

  // ── 6. listPublished returns only active with active version ────────

  it('listPublished returns only active scorers with an active version', async () => {
    // Active with active version — should appear
    await seedScorerDefinition(db, { name: 'Published A', status: 'active', setActiveVersion: true });
    await seedScorerDefinition(db, { name: 'Published B', status: 'active', setActiveVersion: true });

    // Active but NO active version (NULL active_version_id) — INNER JOIN excludes it
    await seedScorerDefinition(db, { name: 'No Version', status: 'active', setActiveVersion: false });

    // Draft with active version — filtered by status
    await seedScorerDefinition(db, { name: 'Draft', status: 'draft', setActiveVersion: true });

    // Archived with active version — filtered by status
    await seedScorerDefinition(db, { name: 'Archived', status: 'archived', setActiveVersion: true });

    const rows = await repo.listPublished();

    expect(rows).toHaveLength(2);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Published A');
    expect(names).toContain('Published B');

    // Verify ordering is by name ASC
    expect(names).toEqual(['Published A', 'Published B']);
  });
});
