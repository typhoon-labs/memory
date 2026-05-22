import crypto from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DocumentRepo } from './document.repo';
import { clearAllTables, createTestConnection, seedDocument, seedSyncTarget } from './test-utils';

describe('DocumentRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new DocumentRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. upsertBySourceKey insert then upsert same key ────────────────

  it('upsertBySourceKey inserts a new row and updates on conflict', async () => {
    const target = await seedSyncTarget(db);

    // Initial insert
    const inserted = await repo.upsertBySourceKey({
      syncTargetId: target.id,
      sourceKey: 'docs/test.pdf',
      status: 'pending',
      fileSize: 1000,
      mimeType: 'application/pdf',
    });

    expect(inserted).toBeDefined();
    expect(inserted.sourceKey).toBe('docs/test.pdf');
    expect(inserted.status).toBe('pending');
    expect(inserted.fileSize).toBe(1000);

    // Upsert same (syncTargetId, sourceKey) — should update, not create a second row
    const upserted = await repo.upsertBySourceKey({
      syncTargetId: target.id,
      sourceKey: 'docs/test.pdf',
      status: 'pending',
      fileSize: 2000,
      mimeType: 'text/plain',
    });

    expect(upserted.id).toBe(inserted.id);
    expect(upserted.status).toBe('processing'); // ON CONFLICT sets status='processing'
    expect(upserted.fileSize).toBe(2000);
    expect(upserted.mimeType).toBe('text/plain');
    expect(upserted.errorMessage).toBeNull(); // ON CONFLICT clears error

    // Verify only one row exists
    const all = await repo.listBySyncTarget(target.id);
    expect(all).toHaveLength(1);
  });

  // ── 2. metadataFields extracts JSONB keys and values ────────────────

  it('metadataFields extracts distinct keys, values, and counts from custom_metadata', async () => {
    const target = await seedSyncTarget(db);

    await seedDocument(db, target.id, { customMetadata: { region: 'US', department: 'engineering' } });
    await seedDocument(db, target.id, { customMetadata: { region: 'EU', department: 'sales' } });
    await seedDocument(db, target.id, { customMetadata: { region: 'US', tier: 'premium' } });

    const fields = await repo.metadataFields();

    // "region" appears in 3 docs, "department" in 2, "tier" in 1
    const regionField = fields.find((f) => f.key === 'region');
    expect(regionField).toBeDefined();

    // Ordered by count DESC — region (3) should be first
    expect(fields[0].key).toBe('region');
    expect(fields[0].count).toBe(3);
    // Should have 2 distinct values: "US" and "EU"
    expect(fields[0].values).toHaveLength(2);
    expect(fields[0].values).toEqual(expect.arrayContaining(['US', 'EU']));

    const deptField = fields.find((f) => f.key === 'department');
    expect(deptField).toBeDefined();
    expect(fields[1].count).toBe(2);

    const tierField = fields.find((f) => f.key === 'tier');
    expect(tierField).toBeDefined();
    expect(fields[2].count).toBe(1);
  });

  // ── 3. metadataFields filters by syncTargetId ──────────────────────

  it('metadataFields filters by syncTargetId', async () => {
    const target1 = await seedSyncTarget(db);
    const target2 = await seedSyncTarget(db);

    await seedDocument(db, target1.id, { customMetadata: { region: 'US' } });
    await seedDocument(db, target2.id, { customMetadata: { category: 'support' } });

    const target1Fields = await repo.metadataFields(target1.id);
    expect(target1Fields).toHaveLength(1);
    expect(target1Fields[0].key).toBe('region');

    const target2Fields = await repo.metadataFields(target2.id);
    expect(target2Fields).toHaveLength(1);
    expect(target2Fields[0].key).toBe('category');
  });

  // ── 4. metadataFields excludes deleted docs and empty metadata ──────

  it('metadataFields excludes deleted docs and empty custom_metadata', async () => {
    const target = await seedSyncTarget(db);

    // Deleted doc — should be excluded
    await seedDocument(db, target.id, { status: 'deleted', customMetadata: { region: 'US' } });

    // Empty metadata — should be excluded
    await seedDocument(db, target.id, { customMetadata: {} });

    // Valid doc with metadata
    await seedDocument(db, target.id, { customMetadata: { region: 'EU' } });

    const fields = await repo.metadataFields();

    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe('region');
    expect(fields[0].count).toBe(1);
    // Only "EU" — the deleted doc's "US" is excluded
    expect(fields[0].values).toEqual(expect.arrayContaining(['EU']));
    expect(fields[0].values).not.toEqual(expect.arrayContaining(['"US"']));
  });

  // ── 5. bulkMarkDeleted with empty array ────────────────────────────

  it('bulkMarkDeleted with empty array does not throw', async () => {
    await expect(repo.bulkMarkDeleted([])).resolves.toBeUndefined();
  });

  // ── 6. listBySourceKeyPrefix LIKE matching ─────────────────────────

  it('listBySourceKeyPrefix returns docs matching prefix, excludes deleted', async () => {
    const target = await seedSyncTarget(db);

    await seedDocument(db, target.id, { sourceKey: 'docs/guides/intro.pdf' });
    await seedDocument(db, target.id, { sourceKey: 'docs/guides/advanced.pdf' });
    await seedDocument(db, target.id, { sourceKey: 'docs/faq.pdf' });
    await seedDocument(db, target.id, { sourceKey: 'images/logo.png' });
    // Deleted doc with matching prefix — should be excluded
    await seedDocument(db, target.id, { sourceKey: 'docs/guides/deleted.pdf', status: 'deleted' });

    const guides = await repo.listBySourceKeyPrefix(target.id, 'docs/guides/');

    expect(guides).toHaveLength(2);
    const keys = guides.map((d) => d.sourceKey);
    expect(keys).toContain('docs/guides/intro.pdf');
    expect(keys).toContain('docs/guides/advanced.pdf');

    // Broader prefix
    const allDocs = await repo.listBySourceKeyPrefix(target.id, 'docs/');
    expect(allDocs).toHaveLength(3); // intro, advanced, faq (not deleted, not images/)
  });

  // ── 7. updateSourceKey composite WHERE ─────────────────────────────

  it('updateSourceKey renames sourceKey within the same syncTarget', async () => {
    const target = await seedSyncTarget(db);
    const doc = await seedDocument(db, target.id, { sourceKey: 'old/path.pdf' });

    const updated = await repo.updateSourceKey(target.id, 'old/path.pdf', 'new/path.pdf');

    expect(updated).not.toBeNull();
    expect(updated?.id).toBe(doc.id);
    expect(updated?.sourceKey).toBe('new/path.pdf');

    // Old key no longer found
    const notFound = await repo.updateSourceKey(target.id, 'old/path.pdf', 'another.pdf');
    expect(notFound).toBeNull();

    // Different syncTarget doesn't match
    const otherTarget = await seedSyncTarget(db);
    const noMatch = await repo.updateSourceKey(otherTarget.id, 'new/path.pdf', 'stolen.pdf');
    expect(noMatch).toBeNull();
  });

  // ── 8. markReady with optional custom_metadata ─────────────────────

  it('markReady transitions document to ready with optional metadata', async () => {
    const target = await seedSyncTarget(db);
    const doc = await seedDocument(db, target.id, { status: 'processing' });

    // markReady without customMetadata
    const readyBasic = await repo.markReady(doc.id, {
      title: 'Getting Started',
      description: 'An introductory guide',
      chunkCount: 12,
    });

    expect(readyBasic).not.toBeNull();
    expect(readyBasic?.status).toBe('ready');
    expect(readyBasic?.title).toBe('Getting Started');
    expect(readyBasic?.description).toBe('An introductory guide');
    expect(readyBasic?.chunkCount).toBe(12);

    // Seed a second doc to test customMetadata path
    const doc2 = await seedDocument(db, target.id, { status: 'processing' });

    const readyWithMeta = await repo.markReady(doc2.id, {
      title: 'FAQ',
      customMetadata: { region: 'US', tier: 'premium' },
    });

    expect(readyWithMeta).not.toBeNull();
    expect(readyWithMeta?.status).toBe('ready');
    expect(readyWithMeta?.title).toBe('FAQ');
    expect(readyWithMeta?.customMetadata).toEqual({ region: 'US', tier: 'premium' });

    // Non-existent ID returns null
    const noDoc = await repo.markReady(crypto.randomUUID(), { title: 'Ghost' });
    expect(noDoc).toBeNull();
  });
});
