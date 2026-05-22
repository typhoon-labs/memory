import { syncTargets } from '@typhoon/db';
import { DocumentRepo, MetadataRepo, SyncTargetRepo } from '@typhoon/db/repos';
import { clearAllTables, createTestConnection, seedSyncTarget } from '@typhoon/db/repos/test-utils';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { MetadataService } from './metadata.service';

/** Assert the result is a success. */
function expectData<T>(result: { data: T } | { error: string }): asserts result is { data: T } {
  expect('data' in result).toBe(true);
}

/** Assert the result is an error. */
function expectError(result: { data: unknown } | { error: string }): asserts result is { error: string } {
  expect('error' in result).toBe(true);
}

describe('MetadataService (integration)', () => {
  const { db, sql } = createTestConnection();
  const service = new MetadataService({
    metadataRepo: new MetadataRepo(db),
    syncTargetRepo: new SyncTargetRepo(db),
    documentRepo: new DocumentRepo(db),
  });

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. createFieldGroup and getFieldGroup ──────────────────────────────

  it('createFieldGroup and getFieldGroup', async () => {
    const createResult = await service.createFieldGroup({
      name: 'Region',
      description: 'Geographic region fields',
      fields: {
        country: { type: 'string', required: true },
        state: { type: 'string' },
      },
    });

    expectData(createResult);
    const group = createResult.data.group as Record<string, unknown>;
    expect(group.name).toBe('Region');
    expect(group.id).toBeDefined();

    // Retrieve by ID
    const getResult = await service.getFieldGroup(group.id as string);
    expectData(getResult);
    const fetched = getResult.data as Record<string, unknown>;
    expect(fetched.name).toBe('Region');
    expect(fetched.description).toBe('Geographic region fields');

    const fields = fetched.fields as Record<string, unknown>;
    expect(fields.country).toEqual({ type: 'string', required: true });
    expect(fields.state).toEqual({ type: 'string' });
  });

  // ── 2. createTemplate validates fieldGroupIds ──────────────────────────

  it('createTemplate validates fieldGroupIds', async () => {
    const fakeGroupId = crypto.randomUUID();

    const result = await service.createTemplate({
      name: 'Bad Template',
      fieldGroupIds: [fakeGroupId],
      customFields: {},
    });

    expectError(result);
    expect(result.error).toContain('Field groups not found');
    expect(result.error).toContain(fakeGroupId);
  });

  // ── 3. getTemplate returns effective schema and syncTargetCount ─────────

  it('getTemplate returns effective schema and syncTargetCount', async () => {
    // Create a field group
    const groupResult = await service.createFieldGroup({
      name: 'Product Info',
      fields: {
        productLine: { type: 'string', required: true },
        version: { type: 'number' },
      },
    });
    expectData(groupResult);
    const groupId = (groupResult.data.group as Record<string, unknown>).id as string;

    // Create a template referencing the group, with custom fields
    const templateResult = await service.createTemplate({
      name: 'Product Template',
      fieldGroupIds: [groupId],
      customFields: {
        region: { type: 'string' },
      },
    });
    expectData(templateResult);
    const templateId = (templateResult.data.template as Record<string, unknown>).id as string;

    // Assign the template to a sync target via direct DB update
    const { id: stId } = await seedSyncTarget(db);
    await db.update(syncTargets).set({ metadataTemplateId: templateId }).where(eq(syncTargets.id, stId));

    // Fetch template via service
    const getResult = await service.getTemplate(templateId);
    expectData(getResult);

    const data = getResult.data as Record<string, unknown>;

    // Verify effective schema merges group fields + custom fields
    const effectiveSchema = data.effectiveSchema as Record<string, unknown>;
    expect(effectiveSchema).toBeDefined();
    expect(effectiveSchema.productLine).toEqual({ type: 'string', required: true });
    expect(effectiveSchema.version).toEqual({ type: 'number' });
    expect(effectiveSchema.region).toEqual({ type: 'string' });

    // Verify syncTargetCount
    expect(data.syncTargetCount).toBe(1);
  });

  // ── 4. deleteFieldGroup cascades to templates ──────────────────────────

  it('deleteFieldGroup cascades to templates', async () => {
    // Create group
    const groupResult = await service.createFieldGroup({
      name: 'Deletable Group',
      fields: { tag: { type: 'string' } },
    });
    expectData(groupResult);
    const groupId = (groupResult.data.group as Record<string, unknown>).id as string;

    // Create template referencing the group
    const templateResult = await service.createTemplate({
      name: 'Cascading Template',
      fieldGroupIds: [groupId],
      customFields: { extra: { type: 'string' } },
    });
    expectData(templateResult);
    const templateId = (templateResult.data.template as Record<string, unknown>).id as string;

    // Delete the group
    const deleteResult = await service.deleteFieldGroup(groupId);
    expectData(deleteResult);
    expect(deleteResult.data.ok).toBe(true);

    // Template should still exist but fieldGroupIds should no longer contain the deleted group
    const getResult = await service.getTemplate(templateId);
    expectData(getResult);

    const data = getResult.data as Record<string, unknown>;
    const fieldGroupIds = data.fieldGroupIds as string[];
    expect(fieldGroupIds).not.toContain(groupId);

    // Custom fields should still be in effective schema
    const effectiveSchema = data.effectiveSchema as Record<string, unknown>;
    expect(effectiveSchema.extra).toEqual({ type: 'string' });
    // Group fields should no longer appear
    expect(effectiveSchema.tag).toBeUndefined();
  });

  // ── 5. listTemplates returns resolved schemas ──────────────────────────

  it('listTemplates returns resolved schemas', async () => {
    // Create two groups
    const group1Result = await service.createFieldGroup({
      name: 'Group Alpha',
      fields: { alpha: { type: 'string' } },
    });
    expectData(group1Result);
    const group1Id = (group1Result.data.group as Record<string, unknown>).id as string;

    const group2Result = await service.createFieldGroup({
      name: 'Group Beta',
      fields: { beta: { type: 'number' } },
    });
    expectData(group2Result);
    const group2Id = (group2Result.data.group as Record<string, unknown>).id as string;

    // Create template 1 with group 1
    const t1Result = await service.createTemplate({
      name: 'Template One',
      fieldGroupIds: [group1Id],
      customFields: { custom1: { type: 'boolean' } },
    });
    expectData(t1Result);

    // Create template 2 with group 2
    const t2Result = await service.createTemplate({
      name: 'Template Two',
      fieldGroupIds: [group2Id],
      customFields: { custom2: { type: 'string' } },
    });
    expectData(t2Result);

    // List templates
    const listResult = await service.listTemplates();
    expectData(listResult);

    const templates = listResult.data as Array<Record<string, unknown>>;
    expect(templates).toHaveLength(2);

    const templateOne = templates.find((t) => t.name === 'Template One');
    const templateTwo = templates.find((t) => t.name === 'Template Two');

    expect(templateOne).toBeDefined();
    expect(templateTwo).toBeDefined();

    // Each should have effectiveSchema
    const schema1 = templateOne?.effectiveSchema as Record<string, unknown>;
    expect(schema1.alpha).toEqual({ type: 'string' });
    expect(schema1.custom1).toEqual({ type: 'boolean' });

    const schema2 = templateTwo?.effectiveSchema as Record<string, unknown>;
    expect(schema2.beta).toEqual({ type: 'number' });
    expect(schema2.custom2).toEqual({ type: 'string' });
  });
});
