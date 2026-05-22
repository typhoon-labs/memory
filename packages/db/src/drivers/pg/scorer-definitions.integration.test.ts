import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleScorerDefinitionsStorage } from './scorer-definitions';
import { createTestConnection } from './test-utils';

describe('DrizzleScorerDefinitionsStorage (integration)', () => {
  const { db, sql } = createTestConnection();
  let storage: DrizzleScorerDefinitionsStorage;

  beforeAll(async () => {
    storage = new DrizzleScorerDefinitionsStorage(db);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('creates a scorer definition and retrieves by ID', async () => {
    const id = crypto.randomUUID();
    await storage.create({
      scorerDefinition: { id, status: 'draft' },
    } as never);

    const result = (await storage.getById(id)) as Record<string, unknown>;
    expect(result).not.toBeNull();
    expect(result.id).toBe(id);
    expect(result.status).toBe('draft');
  });

  it('creates a version, activates it, and verifies resolution', async () => {
    const defId = crypto.randomUUID();
    await storage.create({
      scorerDefinition: { id: defId, status: 'active' },
    } as never);

    const versionId = crypto.randomUUID();
    await storage.createVersion({
      id: versionId,
      scorerDefinitionId: defId,
      versionNumber: 1,
      name: 'Faithfulness v1',
      type: 'faithfulness',
    } as never);

    // Activate the version
    await storage.update({ id: defId, activeVersionId: versionId } as never);

    const def = (await storage.getById(defId)) as Record<string, unknown>;
    expect(def.activeVersionId).toBe(versionId);

    const version = (await storage.getVersion(versionId)) as Record<string, unknown>;
    expect(version).not.toBeNull();
    expect(version.name).toBe('Faithfulness v1');
  });

  it('deletes definition and cascades to versions', async () => {
    const defId = crypto.randomUUID();
    await storage.create({
      scorerDefinition: { id: defId, status: 'draft' },
    } as never);

    const versionId = crypto.randomUUID();
    await storage.createVersion({
      id: versionId,
      scorerDefinitionId: defId,
      versionNumber: 1,
      name: 'Test',
      type: 'faithfulness',
    } as never);

    await storage.delete(defId);

    const def = await storage.getById(defId);
    expect(def).toBeNull();

    const version = await storage.getVersion(versionId);
    expect(version).toBeNull();
  });

  it('getLatestVersion returns highest version number', async () => {
    const defId = crypto.randomUUID();
    await storage.create({
      scorerDefinition: { id: defId, status: 'active' },
    } as never);

    await storage.createVersion({
      id: crypto.randomUUID(),
      scorerDefinitionId: defId,
      versionNumber: 1,
      name: 'v1',
      type: 'faithfulness',
    } as never);

    await storage.createVersion({
      id: crypto.randomUUID(),
      scorerDefinitionId: defId,
      versionNumber: 2,
      name: 'v2',
      type: 'faithfulness',
    } as never);

    const latest = (await storage.getLatestVersion(defId)) as Record<string, unknown>;
    expect(latest).not.toBeNull();
    expect(latest.versionNumber).toBe(2);
    expect(latest.name).toBe('v2');
  });
});
