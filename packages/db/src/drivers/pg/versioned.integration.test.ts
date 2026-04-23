import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agents, agentVersions } from '../../schema/versioned/agents';
import { createTestConnection } from './test-utils';
import { createVersionedDriver } from './versioned';

describe('createVersionedDriver (integration)', () => {
  const { db, sql } = createTestConnection();

  const driver = createVersionedDriver({
    mainTable: agents,
    versionTable: agentVersions,
    mainId: agents.id,
    versionEntityId: agentVersions.agentId,
    versionNumber: agentVersions.versionNumber,
    authorId: agents.authorId,
    createdAt: agents.createdAt,
    updatedAt: agents.updatedAt,
    versionId: agentVersions.id,
    versionCreatedAt: agentVersions.createdAt,
  });

  beforeEach(async () => {
    await driver.dangerouslyClearAll(db);
  });

  afterAll(async () => {
    await driver.dangerouslyClearAll(db);
    await sql.end();
  });

  describe('main entity CRUD', () => {
    it('create and getById', async () => {
      const agentId = crypto.randomUUID();

      const entity = await driver.create(db, {
        id: agentId,
        status: 'draft',
        activeVersionId: null,
        authorId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(entity.id).toBe(agentId);

      const fetched = await driver.getById(db, agentId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(agentId);
    });

    it('getById returns null for non-existent', async () => {
      const result = await driver.getById(db, crypto.randomUUID());
      expect(result).toBeNull();
    });

    it('update', async () => {
      const agentId = crypto.randomUUID();

      await driver.create(db, {
        id: agentId,
        status: 'draft',
        activeVersionId: null,
        authorId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updated = await driver.update(db, agentId, { status: 'active' });
      expect(updated.status).toBe('active');
    });

    it('delete removes entity and versions', async () => {
      const agentId = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      await driver.create(db, {
        id: agentId,
        status: 'draft',
        activeVersionId: null,
        authorId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await driver.createVersion(db, {
        id: versionId,
        agentId,
        versionNumber: 1,
        name: 'Test',
        instructions: 'Do things',
        model: { provider: 'test' },
        createdAt: new Date(),
      });

      await driver.delete(db, agentId);
      expect(await driver.getById(db, agentId)).toBeNull();
      expect(await driver.getVersion(db, versionId)).toBeNull();
    });

    it('list with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await driver.create(db, {
          id: crypto.randomUUID(),
          status: 'draft',
          activeVersionId: null,
          authorId: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const page0 = await driver.list(db, { page: 0, perPage: 2 });
      expect(page0.rows.length).toBe(2);
      expect(page0.total).toBe(5);
      expect(page0.hasMore).toBe(true);

      const page2 = await driver.list(db, { page: 2, perPage: 2 });
      expect(page2.rows.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe('version CRUD', () => {
    let agentVId: string;

    beforeEach(async () => {
      agentVId = crypto.randomUUID();
      await driver.create(db, {
        id: agentVId,
        status: 'draft',
        activeVersionId: null,
        authorId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('createVersion and getVersion', async () => {
      const verId = crypto.randomUUID();

      const version = await driver.createVersion(db, {
        id: verId,
        agentId: agentVId,
        versionNumber: 1,
        name: 'V1',
        instructions: 'test',
        model: { provider: 'test' },
        createdAt: new Date(),
      });
      expect(version.id).toBe(verId);

      const fetched = await driver.getVersion(db, verId);
      expect(fetched?.id).toBe(verId);
    });

    it('getVersionByNumber', async () => {
      const verId = crypto.randomUUID();

      await driver.createVersion(db, {
        id: verId,
        agentId: agentVId,
        versionNumber: 2,
        name: 'V2',
        instructions: 'test',
        model: { provider: 'test' },
        createdAt: new Date(),
      });

      const result = await driver.getVersionByNumber(db, agentVId, 2);
      expect(result?.id).toBe(verId);
    });

    it('getLatestVersion', async () => {
      const verA = crypto.randomUUID();
      const verB = crypto.randomUUID();

      await driver.createVersion(db, {
        id: verA,
        agentId: agentVId,
        versionNumber: 1,
        name: 'V1',
        instructions: 'test',
        model: {},
        createdAt: new Date(),
      });
      await driver.createVersion(db, {
        id: verB,
        agentId: agentVId,
        versionNumber: 2,
        name: 'V2',
        instructions: 'test',
        model: {},
        createdAt: new Date(),
      });

      const latest = await driver.getLatestVersion(db, agentVId);
      expect(latest?.id).toBe(verB);
      expect((latest as Record<string, unknown>).versionNumber).toBe(2);
    });

    it('countVersions', async () => {
      await driver.createVersion(db, {
        id: crypto.randomUUID(),
        agentId: agentVId,
        versionNumber: 1,
        name: 'V1',
        instructions: '',
        model: {},
        createdAt: new Date(),
      });
      await driver.createVersion(db, {
        id: crypto.randomUUID(),
        agentId: agentVId,
        versionNumber: 2,
        name: 'V2',
        instructions: '',
        model: {},
        createdAt: new Date(),
      });

      const count = await driver.countVersions(db, agentVId);
      expect(count).toBe(2);
    });

    it('deleteVersion', async () => {
      const dvId = crypto.randomUUID();

      await driver.createVersion(db, {
        id: dvId,
        agentId: agentVId,
        versionNumber: 1,
        name: 'V1',
        instructions: '',
        model: {},
        createdAt: new Date(),
      });
      await driver.deleteVersion(db, dvId);
      expect(await driver.getVersion(db, dvId)).toBeNull();
    });

    it('deleteVersionsByParentId', async () => {
      await driver.createVersion(db, {
        id: crypto.randomUUID(),
        agentId: agentVId,
        versionNumber: 1,
        name: 'V1',
        instructions: '',
        model: {},
        createdAt: new Date(),
      });
      await driver.createVersion(db, {
        id: crypto.randomUUID(),
        agentId: agentVId,
        versionNumber: 2,
        name: 'V2',
        instructions: '',
        model: {},
        createdAt: new Date(),
      });

      await driver.deleteVersionsByParentId(db, agentVId);
      expect(await driver.countVersions(db, agentVId)).toBe(0);
    });

    it('listVersions with pagination', async () => {
      for (let i = 1; i <= 5; i++) {
        await driver.createVersion(db, {
          id: crypto.randomUUID(),
          agentId: agentVId,
          versionNumber: i,
          name: `V${i}`,
          instructions: '',
          model: {},
          createdAt: new Date(),
        });
      }

      const result = await driver.listVersions(db, agentVId, { page: 0, perPage: 2 });
      expect(result.rows.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });
  });
});
