import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/types', () => ({
  resolveTemplateSchema: vi.fn(
    (template: { customFields: Record<string, unknown> }, groups: Array<{ fields: Record<string, unknown> }>) => ({
      fields: {
        ...Object.fromEntries(groups.flatMap((g) => Object.entries(g.fields ?? {}))),
        ...template.customFields,
      },
    }),
  ),
}));

import { MetadataRepo } from './metadata.repo';

function createMockDb() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const makeChain = (): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get(_, prop) {
        if (prop === 'then') return undefined;
        chain[prop as string] ??= vi.fn().mockReturnValue(makeChain());
        return chain[prop as string];
      },
    });

  const db = {
    select: vi.fn().mockReturnValue(makeChain()),
    insert: vi.fn().mockReturnValue(makeChain()),
    update: vi.fn().mockReturnValue(makeChain()),
    delete: vi.fn().mockReturnValue(makeChain()),
    execute: vi.fn(),
    _chain: chain,
  };

  return db;
}

describe('MetadataRepo', () => {
  let db: ReturnType<typeof createMockDb>;
  let repo: MetadataRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    repo = new MetadataRepo(db as any);
  });

  describe('resolveEffectiveSchema', () => {
    it('returns null when template not found', async () => {
      // First select().from().where() returns empty for template lookup
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.resolveEffectiveSchema('tmpl-missing');
      expect(result).toBeNull();
    });

    it('resolves schema with field groups', async () => {
      const template = { id: 'tmpl-1', fieldGroupIds: ['grp-1'], customFields: { custom: { type: 'string' } } };
      const group = { id: 'grp-1', fields: { region: { type: 'string' } } };

      // First call: template lookup; second call: field group lookup
      let callCount = 0;
      db._chain.where = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([template]);
        return Promise.resolve([group]);
      });

      const result = await repo.resolveEffectiveSchema('tmpl-1');
      expect(result).toBeDefined();
      expect(result?.fields).toHaveProperty('region');
      expect(result?.fields).toHaveProperty('custom');
    });

    it('resolves schema with no field groups', async () => {
      const template = { id: 'tmpl-1', fieldGroupIds: [], customFields: { tag: { type: 'string' } } };
      db._chain.where = vi.fn().mockResolvedValue([template]);

      const result = await repo.resolveEffectiveSchema('tmpl-1');
      expect(result).toBeDefined();
    });
  });

  describe('listFieldGroups', () => {
    it('returns all field groups', async () => {
      const groups = [{ id: 'grp-1', name: 'Region' }];
      db._chain.from = vi.fn().mockResolvedValue(groups);

      const result = await repo.listFieldGroups();
      expect(result).toEqual(groups);
    });
  });

  describe('findFieldGroupById', () => {
    it('returns group when found', async () => {
      const group = { id: 'grp-1', name: 'Region' };
      db._chain.where = vi.fn().mockResolvedValue([group]);

      const result = await repo.findFieldGroupById('grp-1');
      expect(result).toEqual(group);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findFieldGroupById('missing');
      expect(result).toBeNull();
    });
  });

  describe('createFieldGroup', () => {
    it('returns created group', async () => {
      const created = { id: 'grp-1', name: 'New' };
      db._chain.returning = vi.fn().mockResolvedValue([created]);

      const result = await repo.createFieldGroup({ name: 'New' } as never);
      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('updateFieldGroup', () => {
    it('returns updated group', async () => {
      const updated = { id: 'grp-1', name: 'Updated' };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.updateFieldGroup('grp-1', { name: 'Updated' } as never);
      expect(result).toEqual(updated);
    });

    it('returns null when no match', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.updateFieldGroup('missing', { name: 'x' } as never);
      expect(result).toBeNull();
    });
  });

  describe('deleteFieldGroup', () => {
    it('updates templates, removes references, and deletes group', async () => {
      // Multiple chained calls: update templates, execute raw SQL, delete group
      db._chain.where = vi.fn().mockResolvedValue(undefined);
      db.execute = vi.fn().mockResolvedValue(undefined);

      await repo.deleteFieldGroup('grp-1');
      expect(db.update).toHaveBeenCalled();
      expect(db.execute).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('listTemplates', () => {
    it('returns all templates', async () => {
      const templates = [{ id: 'tmpl-1', name: 'Default' }];
      db._chain.from = vi.fn().mockResolvedValue(templates);

      const result = await repo.listTemplates();
      expect(result).toEqual(templates);
    });
  });

  describe('findTemplateById', () => {
    it('returns template when found', async () => {
      const tmpl = { id: 'tmpl-1', name: 'Default' };
      db._chain.where = vi.fn().mockResolvedValue([tmpl]);

      const result = await repo.findTemplateById('tmpl-1');
      expect(result).toEqual(tmpl);
    });

    it('returns null when not found', async () => {
      db._chain.where = vi.fn().mockResolvedValue([]);

      const result = await repo.findTemplateById('missing');
      expect(result).toBeNull();
    });
  });

  describe('createTemplate', () => {
    it('returns created template', async () => {
      const created = { id: 'tmpl-1', name: 'New' };
      db._chain.returning = vi.fn().mockResolvedValue([created]);

      const result = await repo.createTemplate({ name: 'New' } as never);
      expect(result).toEqual(created);
    });
  });

  describe('updateTemplate', () => {
    it('returns updated template', async () => {
      const updated = { id: 'tmpl-1', name: 'Updated' };
      db._chain.returning = vi.fn().mockResolvedValue([updated]);

      const result = await repo.updateTemplate('tmpl-1', { name: 'Updated' } as never);
      expect(result).toEqual(updated);
    });

    it('returns null when no match', async () => {
      db._chain.returning = vi.fn().mockResolvedValue([]);

      const result = await repo.updateTemplate('missing', {} as never);
      expect(result).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('calls delete', async () => {
      db._chain.where = vi.fn().mockResolvedValue(undefined);

      await repo.deleteTemplate('tmpl-1');
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('findFieldGroupsByIds', () => {
    it('returns empty array for empty input', async () => {
      const result = await repo.findFieldGroupsByIds([]);
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns matching groups', async () => {
      const groups = [{ id: 'grp-1' }, { id: 'grp-2' }];
      db._chain.where = vi.fn().mockResolvedValue(groups);

      const result = await repo.findFieldGroupsByIds(['grp-1', 'grp-2']);
      expect(result).toEqual(groups);
    });
  });

  describe('resolveEffectiveSchemaBatch', () => {
    it('resolves schemas for multiple templates', async () => {
      const groups = [{ id: 'grp-1', fields: { region: { type: 'string' } } }];
      db._chain.where = vi.fn().mockResolvedValue(groups);

      const templates: Array<{ fieldGroupIds: string[]; customFields: Record<string, { type: 'string' }> }> = [
        { fieldGroupIds: ['grp-1'], customFields: { tag: { type: 'string' } } },
        { fieldGroupIds: [], customFields: { status: { type: 'string' } } },
      ];

      const result = await repo.resolveEffectiveSchemaBatch(templates);
      expect(result).toHaveLength(2);
    });

    it('skips field group fetch when no groups referenced', async () => {
      const templates = [{ fieldGroupIds: [] as string[], customFields: { a: { type: 'string' as const } } }];

      const result = await repo.resolveEffectiveSchemaBatch(templates);
      expect(result).toHaveLength(1);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('getFieldValuesForAgent', () => {
    it('returns formatted string when rows exist', async () => {
      db.execute.mockResolvedValueOnce([
        { key: 'region', values: ['US', 'EU'] },
        { key: 'status', values: ['published', 'draft'] },
      ]);

      const result = await repo.getFieldValuesForAgent();
      expect(result).toBe('region: US, EU | status: published, draft');
      expect(db.execute).toHaveBeenCalled();
    });

    it('returns undefined when no rows', async () => {
      db.execute.mockResolvedValueOnce([]);

      const result = await repo.getFieldValuesForAgent();
      expect(result).toBeUndefined();
    });

    it('stringifies non-string values', async () => {
      db.execute.mockResolvedValueOnce([{ key: 'count', values: [42, true] }]);

      const result = await repo.getFieldValuesForAgent();
      expect(result).toBe('count: 42, true');
    });
  });
});
