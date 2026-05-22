import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertErr, assertOk } from '../test-helpers';
import type { MetadataServiceDeps } from './metadata.service';
import { MetadataService } from './metadata.service';

vi.mock('@typhoon/types', () => ({
  resolveTemplateSchema: vi.fn(
    (template: { customFields: Record<string, unknown> }, groups: Array<{ fields: Record<string, unknown> }>) => {
      const merged: Record<string, unknown> = {};
      for (const g of groups) Object.assign(merged, g.fields);
      Object.assign(merged, template.customFields);
      return merged;
    },
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<MetadataServiceDeps> = {}): MetadataServiceDeps {
  return {
    metadataRepo: {
      listFieldGroups: vi.fn().mockResolvedValue([]),
      findFieldGroupById: vi.fn().mockResolvedValue(null),
      findFieldGroupsByIds: vi.fn().mockResolvedValue([]),
      createFieldGroup: vi.fn().mockResolvedValue({ id: 'fg-1', name: 'Region' }),
      updateFieldGroup: vi.fn().mockResolvedValue({ id: 'fg-1' }),
      findTemplatesByFieldGroupId: vi.fn().mockResolvedValue([]),
      deleteFieldGroup: vi.fn().mockResolvedValue(undefined),
      listTemplates: vi.fn().mockResolvedValue([]),
      findTemplateById: vi.fn().mockResolvedValue(null),
      createTemplate: vi.fn().mockResolvedValue({
        id: 'tmpl-1',
        name: 'Default',
        fieldGroupIds: [],
        customFields: {},
      }),
      updateTemplate: vi.fn().mockResolvedValue(null),
      deleteTemplate: vi.fn().mockResolvedValue(undefined),
      resolveEffectiveSchemaBatch: vi.fn().mockResolvedValue([]),
    } as unknown as MetadataServiceDeps['metadataRepo'],
    syncTargetRepo: {
      countByMetadataTemplateId: vi.fn().mockResolvedValue(0),
      findByMetadataTemplateId: vi.fn().mockResolvedValue([]),
      findByMetadataTemplateIds: vi.fn().mockResolvedValue([]),
    } as unknown as MetadataServiceDeps['syncTargetRepo'],
    documentRepo: {
      markSearchMetaDirty: vi.fn().mockResolvedValue(undefined),
    } as unknown as MetadataServiceDeps['documentRepo'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('MetadataService', () => {
  let deps: MetadataServiceDeps;
  let service: MetadataService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new MetadataService(deps);
  });

  // ── Field Groups ───────────────────────────────────────────────

  describe('listFieldGroups', () => {
    it('returns all field groups', async () => {
      const groups = [
        { id: 'fg-1', name: 'Region' },
        { id: 'fg-2', name: 'Department' },
      ];
      vi.mocked(deps.metadataRepo.listFieldGroups).mockResolvedValueOnce(groups as never);

      const result = await service.listFieldGroups();
      const data = assertOk(result);
      expect(data).toEqual(groups);
    });
  });

  describe('getFieldGroup', () => {
    it('returns field group when found', async () => {
      const group = { id: 'fg-1', name: 'Region', fields: { country: { type: 'string' } } };
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce(group as never);

      const result = await service.getFieldGroup('fg-1');
      const data = assertOk(result);
      expect(data).toEqual(group);
    });

    it('returns not-found when group does not exist', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce(null as never);
      const result = await service.getFieldGroup('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('createFieldGroup', () => {
    it('creates field group and returns with 201 status', async () => {
      const created = { id: 'fg-new', name: 'Product' };
      vi.mocked(deps.metadataRepo.createFieldGroup).mockResolvedValueOnce(created as never);

      const result = await service.createFieldGroup({ name: 'Product', fields: { sku: { type: 'string' } } });
      const data = assertOk(result);
      expect(data).toEqual({ group: created, _status: 201 });
    });
  });

  describe('updateFieldGroup', () => {
    it('updates field group when it exists', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce({ id: 'fg-1' } as never);
      vi.mocked(deps.metadataRepo.updateFieldGroup).mockResolvedValueOnce({ id: 'fg-1', name: 'Updated' } as never);

      const result = await service.updateFieldGroup('fg-1', { name: 'Updated' });
      const data = assertOk(result);
      expect(data).toMatchObject({ name: 'Updated' });
    });

    it('returns not-found when field group does not exist', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce(null as never);
      const result = await service.updateFieldGroup('nonexistent', { name: 'X' });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  describe('updateFieldGroup — dirty marking', () => {
    it('calls markSearchMetaDirty when fields input is provided', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce({ id: 'fg-1' } as never);
      vi.mocked(deps.metadataRepo.updateFieldGroup).mockResolvedValueOnce({ id: 'fg-1', name: 'Updated' } as never);
      vi.mocked(deps.metadataRepo.findTemplatesByFieldGroupId).mockResolvedValueOnce([
        { id: 'tmpl-1' },
        { id: 'tmpl-2' },
      ] as never);
      vi.mocked(deps.syncTargetRepo.findByMetadataTemplateIds).mockResolvedValueOnce([
        { id: 'st-1' },
        { id: 'st-2' },
        { id: 'st-3' },
      ] as never);

      const result = await service.updateFieldGroup('fg-1', {
        name: 'Updated',
        fields: { country: { type: 'string' } },
      });
      const data = assertOk(result) as Record<string, unknown>;

      expect(deps.metadataRepo.findTemplatesByFieldGroupId).toHaveBeenCalledWith('fg-1');
      expect(deps.syncTargetRepo.findByMetadataTemplateIds).toHaveBeenCalledWith(['tmpl-1', 'tmpl-2']);
      expect(deps.documentRepo.markSearchMetaDirty).toHaveBeenCalledWith(['st-1', 'st-2', 'st-3']);
      expect(data.affectedSyncTargetCount).toBe(3);
    });

    it('does NOT call markSearchMetaDirty for name-only change', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce({ id: 'fg-1' } as never);
      vi.mocked(deps.metadataRepo.updateFieldGroup).mockResolvedValueOnce({ id: 'fg-1', name: 'Renamed' } as never);

      const result = await service.updateFieldGroup('fg-1', { name: 'Renamed' });
      const data = assertOk(result) as Record<string, unknown>;

      expect(deps.metadataRepo.findTemplatesByFieldGroupId).not.toHaveBeenCalled();
      expect(deps.syncTargetRepo.findByMetadataTemplateIds).not.toHaveBeenCalled();
      expect(deps.documentRepo.markSearchMetaDirty).not.toHaveBeenCalled();
      expect(data.affectedSyncTargetCount).toBe(0);
    });

    it('returns affectedSyncTargetCount=0 when no templates reference the group', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce({ id: 'fg-1' } as never);
      vi.mocked(deps.metadataRepo.updateFieldGroup).mockResolvedValueOnce({ id: 'fg-1', name: 'Updated' } as never);
      vi.mocked(deps.metadataRepo.findTemplatesByFieldGroupId).mockResolvedValueOnce([] as never);

      const result = await service.updateFieldGroup('fg-1', {
        name: 'Updated',
        fields: { country: { type: 'string' } },
      });
      const data = assertOk(result) as Record<string, unknown>;

      expect(deps.documentRepo.markSearchMetaDirty).not.toHaveBeenCalled();
      expect(data.affectedSyncTargetCount).toBe(0);
    });
  });

  describe('deleteFieldGroup', () => {
    it('deletes field group and returns ok', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce({ id: 'fg-1' } as never);
      const result = await service.deleteFieldGroup('fg-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.metadataRepo.deleteFieldGroup).toHaveBeenCalledWith('fg-1');
    });

    it('returns not-found when field group does not exist', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupById).mockResolvedValueOnce(null as never);
      const result = await service.deleteFieldGroup('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });

  // ── Templates ──────────────────────────────────────────────────

  describe('listTemplates', () => {
    it('returns templates with effective schemas', async () => {
      const templates = [
        { id: 'tmpl-1', name: 'Default', fieldGroupIds: ['fg-1'], customFields: { lang: { type: 'string' } } },
      ];
      vi.mocked(deps.metadataRepo.listTemplates).mockResolvedValueOnce(templates as never);
      vi.mocked(deps.metadataRepo.resolveEffectiveSchemaBatch).mockResolvedValueOnce([
        { country: { type: 'string' }, lang: { type: 'string' } },
      ] as never);

      const result = await service.listTemplates();
      const data = assertOk(result) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(1);
      expect(data[0]).toHaveProperty('effectiveSchema');
    });
  });

  describe('getTemplate', () => {
    it('returns template with effective schema and sync target count', async () => {
      const template = {
        id: 'tmpl-1',
        name: 'Default',
        fieldGroupIds: ['fg-1'],
        customFields: { lang: { type: 'string' } },
      };
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce(template as never);
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([
        { id: 'fg-1', fields: { country: { type: 'string' } } },
      ] as never);
      vi.mocked(deps.syncTargetRepo.countByMetadataTemplateId).mockResolvedValueOnce(3 as never);

      const result = await service.getTemplate('tmpl-1');
      const data = assertOk(result) as Record<string, unknown>;
      expect(data).toHaveProperty('effectiveSchema');
      expect(data.syncTargetCount).toBe(3);
    });

    it('returns not-found when template does not exist', async () => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce(null as never);
      const result = await service.getTemplate('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('skips field group fetch when fieldGroupIds is empty', async () => {
      const template = { id: 'tmpl-1', name: 'Simple', fieldGroupIds: [], customFields: {} };
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce(template as never);
      vi.mocked(deps.syncTargetRepo.countByMetadataTemplateId).mockResolvedValueOnce(0 as never);

      await service.getTemplate('tmpl-1');
      expect(deps.metadataRepo.findFieldGroupsByIds).not.toHaveBeenCalled();
    });
  });

  describe('createTemplate', () => {
    it('creates template with valid field group IDs', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([
        { id: 'fg-1', fields: { country: { type: 'string' } } },
      ] as never);
      const created = { id: 'tmpl-new', name: 'New', fieldGroupIds: ['fg-1'], customFields: {} };
      vi.mocked(deps.metadataRepo.createTemplate).mockResolvedValueOnce(created as never);
      // For resolving effective schema after creation
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([
        { id: 'fg-1', fields: { country: { type: 'string' } } },
      ] as never);

      const result = await service.createTemplate({
        name: 'New',
        fieldGroupIds: ['fg-1'],
        customFields: {},
      });

      const data = assertOk(result) as Record<string, unknown>;
      expect(data._status).toBe(201);
      expect(data.template).toEqual(created);
      expect(data).toHaveProperty('effectiveSchema');
    });

    it('returns error when referenced field groups do not exist', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([] as never);

      const result = await service.createTemplate({
        name: 'Bad',
        fieldGroupIds: ['fg-missing'],
        customFields: {},
      });

      const error = assertErr(result);
      expect(error).toContain('Field groups not found');
      expect(error).toContain('fg-missing');
    });

    it('skips field group validation when fieldGroupIds is empty', async () => {
      const created = { id: 'tmpl-new', name: 'Simple', fieldGroupIds: [], customFields: { x: { type: 'string' } } };
      vi.mocked(deps.metadataRepo.createTemplate).mockResolvedValueOnce(created as never);

      const result = await service.createTemplate({
        name: 'Simple',
        fieldGroupIds: [],
        customFields: { x: { type: 'string' } },
      });

      assertOk(result);
      expect(deps.metadataRepo.findFieldGroupsByIds).not.toHaveBeenCalled();
    });
  });

  describe('updateTemplate', () => {
    it('updates template and resolves effective schema', async () => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce({
        id: 'tmpl-1',
        fieldGroupIds: [],
      } as never);
      const updated = { id: 'tmpl-1', name: 'Updated', fieldGroupIds: [], customFields: { x: { type: 'number' } } };
      vi.mocked(deps.metadataRepo.updateTemplate).mockResolvedValueOnce(updated as never);

      const result = await service.updateTemplate('tmpl-1', { name: 'Updated' });
      const data = assertOk(result) as Record<string, unknown>;
      expect(data).toHaveProperty('effectiveSchema');
    });

    it('returns not-found when template does not exist', async () => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce(null as never);
      const result = await service.updateTemplate('nonexistent', { name: 'X' });
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });

    it('returns error when updated field group IDs do not exist', async () => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce({
        id: 'tmpl-1',
        fieldGroupIds: [],
      } as never);
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([] as never);

      const result = await service.updateTemplate('tmpl-1', { fieldGroupIds: ['fg-missing'] });
      const error = assertErr(result);
      expect(error).toContain('Field groups not found');
    });
  });

  describe('updateTemplate — dirty marking', () => {
    beforeEach(() => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValue({
        id: 'tmpl-1',
        fieldGroupIds: [],
      } as never);
    });

    it('calls markSearchMetaDirty when fieldGroupIds changes', async () => {
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([{ id: 'fg-1' }] as never);
      const updated = { id: 'tmpl-1', name: 'T', fieldGroupIds: ['fg-1'], customFields: {} };
      vi.mocked(deps.metadataRepo.updateTemplate).mockResolvedValueOnce(updated as never);
      vi.mocked(deps.metadataRepo.findFieldGroupsByIds).mockResolvedValueOnce([{ id: 'fg-1', fields: {} }] as never);
      vi.mocked(deps.syncTargetRepo.findByMetadataTemplateId).mockResolvedValueOnce([
        { id: 'st-1' },
        { id: 'st-2' },
      ] as never);

      const result = await service.updateTemplate('tmpl-1', { fieldGroupIds: ['fg-1'] });
      const data = assertOk(result) as Record<string, unknown>;

      expect(deps.syncTargetRepo.findByMetadataTemplateId).toHaveBeenCalledWith('tmpl-1');
      expect(deps.documentRepo.markSearchMetaDirty).toHaveBeenCalledWith(['st-1', 'st-2']);
      expect(data.syncTargetCount).toBe(2);
    });

    it('calls markSearchMetaDirty when customFields changes', async () => {
      const updated = { id: 'tmpl-1', name: 'T', fieldGroupIds: [], customFields: { lang: { type: 'string' } } };
      vi.mocked(deps.metadataRepo.updateTemplate).mockResolvedValueOnce(updated as never);
      vi.mocked(deps.syncTargetRepo.findByMetadataTemplateId).mockResolvedValueOnce([{ id: 'st-1' }] as never);

      const result = await service.updateTemplate('tmpl-1', {
        customFields: { lang: { type: 'string' } },
      });
      const data = assertOk(result) as Record<string, unknown>;

      expect(deps.syncTargetRepo.findByMetadataTemplateId).toHaveBeenCalledWith('tmpl-1');
      expect(deps.documentRepo.markSearchMetaDirty).toHaveBeenCalledWith(['st-1']);
      expect(data.syncTargetCount).toBe(1);
    });

    it('does NOT call markSearchMetaDirty for name-only change but still returns syncTargetCount', async () => {
      const updated = { id: 'tmpl-1', name: 'Renamed', fieldGroupIds: [], customFields: {} };
      vi.mocked(deps.metadataRepo.updateTemplate).mockResolvedValueOnce(updated as never);
      vi.mocked(deps.syncTargetRepo.countByMetadataTemplateId).mockResolvedValueOnce(5 as never);

      const result = await service.updateTemplate('tmpl-1', { name: 'Renamed' });
      const data = assertOk(result) as Record<string, unknown>;

      expect(deps.syncTargetRepo.findByMetadataTemplateId).not.toHaveBeenCalled();
      expect(deps.documentRepo.markSearchMetaDirty).not.toHaveBeenCalled();
      expect(data.syncTargetCount).toBe(5);
    });
  });

  describe('deleteTemplate', () => {
    it('deletes template and returns ok', async () => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce({ id: 'tmpl-1' } as never);
      const result = await service.deleteTemplate('tmpl-1');
      const data = assertOk(result);
      expect(data).toEqual({ ok: true });
      expect(deps.metadataRepo.deleteTemplate).toHaveBeenCalledWith('tmpl-1');
    });

    it('returns not-found when template does not exist', async () => {
      vi.mocked(deps.metadataRepo.findTemplateById).mockResolvedValueOnce(null as never);
      const result = await service.deleteTemplate('nonexistent');
      const error = assertErr(result);
      expect(error).toBe('not-found');
    });
  });
});
