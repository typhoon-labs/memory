import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MetadataRepo } from './metadata.repo';
import { clearAllTables, createTestConnection, seedDocument, seedSyncTarget } from './test-utils';

describe('MetadataRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new MetadataRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── Field Group CRUD ─────────────────────────────────────────

  it('creates and retrieves a field group', async () => {
    const group = await repo.createFieldGroup({
      name: 'Region',
      fields: { country: { type: 'string' }, state: { type: 'string' } },
    });
    expect(group.id).toBeTruthy();

    const fetched = await repo.findFieldGroupById(group.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('Region');
    expect(fetched?.fields).toEqual({ country: { type: 'string' }, state: { type: 'string' } });
  });

  it('lists all field groups', async () => {
    await repo.createFieldGroup({ name: 'A', fields: {} });
    await repo.createFieldGroup({ name: 'B', fields: {} });
    const groups = await repo.listFieldGroups();
    expect(groups.length).toBe(2);
  });

  it('updates a field group', async () => {
    const group = await repo.createFieldGroup({ name: 'Old', fields: {} });
    const updated = await repo.updateFieldGroup(group.id, { name: 'New' });
    expect(updated?.name).toBe('New');
  });

  // ── Template CRUD ───────────────────────────────────────────

  it('creates and retrieves a template', async () => {
    const tmpl = await repo.createTemplate({
      name: 'Support Docs',
      fieldGroupIds: [],
      customFields: { priority: { type: 'string' } },
    });
    expect(tmpl.id).toBeTruthy();

    const fetched = await repo.findTemplateById(tmpl.id);
    expect(fetched?.name).toBe('Support Docs');
    expect(fetched?.customFields).toEqual({ priority: { type: 'string' } });
  });

  it('deletes a template', async () => {
    const tmpl = await repo.createTemplate({ name: 'Temp', fieldGroupIds: [], customFields: {} });
    await repo.deleteTemplate(tmpl.id);
    const fetched = await repo.findTemplateById(tmpl.id);
    expect(fetched).toBeNull();
  });

  // ── resolveEffectiveSchema ──────────────────────────────────

  it('resolves effective schema by merging field groups and custom fields', async () => {
    const g1 = await repo.createFieldGroup({
      name: 'Region',
      fields: { country: { type: 'string' } },
    });
    const g2 = await repo.createFieldGroup({
      name: 'Product',
      fields: { productLine: { type: 'string' } },
    });
    const tmpl = await repo.createTemplate({
      name: 'Merged',
      fieldGroupIds: [g1.id, g2.id],
      customFields: { priority: { type: 'number' } },
    });

    const schema = await repo.resolveEffectiveSchema(tmpl.id);
    expect(schema).not.toBeNull();
    expect(schema).toEqual({
      country: { type: 'string' },
      productLine: { type: 'string' },
      priority: { type: 'number' },
    });
  });

  it('resolveEffectiveSchema returns null for non-existent template', async () => {
    const schema = await repo.resolveEffectiveSchema('00000000-0000-0000-0000-000000000000');
    expect(schema).toBeNull();
  });

  // ── deleteFieldGroup removes JSONB references ──────────────

  it('deleteFieldGroup removes group ID from template fieldGroupIds', async () => {
    const group = await repo.createFieldGroup({ name: 'ToDelete', fields: { x: { type: 'string' } } });
    const tmpl = await repo.createTemplate({
      name: 'Referencing',
      fieldGroupIds: [group.id],
      customFields: {},
    });

    await repo.deleteFieldGroup(group.id);

    // Group should be gone
    const fetchedGroup = await repo.findFieldGroupById(group.id);
    expect(fetchedGroup).toBeNull();

    // Template should have the group removed from fieldGroupIds
    const fetchedTmpl = await repo.findTemplateById(tmpl.id);
    expect(fetchedTmpl?.fieldGroupIds).toEqual([]);
  });

  // ── findFieldGroupsByIds ────────────────────────────────────

  it('findFieldGroupsByIds returns empty for empty array', async () => {
    const groups = await repo.findFieldGroupsByIds([]);
    expect(groups).toEqual([]);
  });

  // ── getFieldValuesForAgent ──────────────────────────────────

  it('getFieldValuesForAgent extracts metadata from documents', async () => {
    const { id: stId } = await seedSyncTarget(db);
    await seedDocument(db, stId, { sourceKey: 'a.pdf', customMetadata: { region: 'US', topic: 'billing' } });
    await seedDocument(db, stId, { sourceKey: 'b.pdf', customMetadata: { region: 'EU', topic: 'billing' } });

    const result = await repo.getFieldValuesForAgent();
    expect(result).toBeTruthy();
    expect(result).toContain('region');
    expect(result).toContain('topic');
  });

  it('getFieldValuesForAgent returns undefined when no metadata', async () => {
    const result = await repo.getFieldValuesForAgent();
    expect(result).toBeUndefined();
  });

  // ── resolveEffectiveSchemaBatch ─────────────────────────────

  it('resolveEffectiveSchemaBatch resolves multiple templates', async () => {
    const g1 = await repo.createFieldGroup({ name: 'Shared', fields: { lang: { type: 'string' } } });

    const schemas = await repo.resolveEffectiveSchemaBatch([
      { fieldGroupIds: [g1.id], customFields: { a: { type: 'string' } } },
      { fieldGroupIds: [g1.id], customFields: { b: { type: 'number' } } },
    ]);

    expect(schemas.length).toBe(2);
    expect(schemas[0]).toEqual({ lang: { type: 'string' }, a: { type: 'string' } });
    expect(schemas[1]).toEqual({ lang: { type: 'string' }, b: { type: 'number' } });
  });
});
