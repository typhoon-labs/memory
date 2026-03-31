import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VersionedStorageHelper } from './versioned.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

describe.skipIf(!process.env.DATABASE_URL)('VersionedStorageHelper (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let helper: VersionedStorageHelper;

  beforeAll(() => {
    sql = postgres(TEST_DB_URL);
    helper = new VersionedStorageHelper(sql, {
      mainTable: 'agents',
      versionsTable: 'agent_versions',
      entityIdColumn: 'agent_id',
    });
  });

  beforeEach(async () => {
    await helper.dangerouslyClearAll();
  });

  afterAll(async () => {
    await helper.dangerouslyClearAll();
    await sql.end();
  });

  describe('main entity CRUD', () => {
    it('create and getById', async () => {
      const agentId = crypto.randomUUID();

      const entity = await helper.create({
        id: agentId,
        status: 'draft',
        active_version_id: null,
        author_id: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      expect(entity.id).toBe(agentId);

      const fetched = await helper.getById(agentId);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(agentId);
    });

    it('getById returns null for non-existent', async () => {
      const result = await helper.getById(crypto.randomUUID());
      expect(result).toBeNull();
    });

    it('update', async () => {
      const agentId = crypto.randomUUID();

      await helper.create({
        id: agentId,
        status: 'draft',
        active_version_id: null,
        author_id: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const updated = await helper.update(agentId, { status: 'published' });
      expect(updated.status).toBe('published');
    });

    it('delete removes entity and versions', async () => {
      const agentId = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      await helper.create({
        id: agentId,
        status: 'draft',
        active_version_id: null,
        author_id: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      await helper.createVersion({
        id: versionId,
        agent_id: agentId,
        version_number: 1,
        name: 'Test',
        instructions: 'Do things',
        model: JSON.stringify({ provider: 'test' }),
        created_at: new Date(),
      });

      await helper.delete(agentId);
      expect(await helper.getById(agentId)).toBeNull();
      expect(await helper.getVersion(versionId)).toBeNull();
    });

    it('list with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await helper.create({
          id: crypto.randomUUID(),
          status: 'draft',
          active_version_id: null,
          author_id: null,
          metadata: null,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      const page0 = await helper.list({ page: 0, perPage: 2 });
      expect(page0.rows.length).toBe(2);
      expect(page0.total).toBe(5);
      expect(page0.hasMore).toBe(true);

      const page2 = await helper.list({ page: 2, perPage: 2 });
      expect(page2.rows.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe('version CRUD', () => {
    let agentVId: string;

    beforeEach(async () => {
      agentVId = crypto.randomUUID();
      await helper.create({
        id: agentVId,
        status: 'draft',
        active_version_id: null,
        author_id: null,
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('createVersion and getVersion', async () => {
      const verId = crypto.randomUUID();

      const version = await helper.createVersion({
        id: verId,
        agent_id: agentVId,
        version_number: 1,
        name: 'V1',
        instructions: 'test',
        model: JSON.stringify({ provider: 'test' }),
        created_at: new Date(),
      });
      expect(version.id).toBe(verId);

      const fetched = await helper.getVersion(verId);
      expect(fetched?.id).toBe(verId);
    });

    it('getVersionByNumber', async () => {
      const verId = crypto.randomUUID();

      await helper.createVersion({
        id: verId,
        agent_id: agentVId,
        version_number: 2,
        name: 'V2',
        instructions: 'test',
        model: JSON.stringify({ provider: 'test' }),
        created_at: new Date(),
      });

      const result = await helper.getVersionByNumber(agentVId, 2);
      expect(result?.id).toBe(verId);
    });

    it('getLatestVersion', async () => {
      const verA = crypto.randomUUID();
      const verB = crypto.randomUUID();

      await helper.createVersion({
        id: verA,
        agent_id: agentVId,
        version_number: 1,
        name: 'V1',
        instructions: 'test',
        model: JSON.stringify({}),
        created_at: new Date(),
      });
      await helper.createVersion({
        id: verB,
        agent_id: agentVId,
        version_number: 2,
        name: 'V2',
        instructions: 'test',
        model: JSON.stringify({}),
        created_at: new Date(),
      });

      const latest = await helper.getLatestVersion(agentVId);
      expect(latest?.id).toBe(verB);
      expect((latest as Record<string, unknown>).version_number).toBe(2);
    });

    it('countVersions', async () => {
      await helper.createVersion({
        id: crypto.randomUUID(),
        agent_id: agentVId,
        version_number: 1,
        name: 'V1',
        instructions: '',
        model: '{}',
        created_at: new Date(),
      });
      await helper.createVersion({
        id: crypto.randomUUID(),
        agent_id: agentVId,
        version_number: 2,
        name: 'V2',
        instructions: '',
        model: '{}',
        created_at: new Date(),
      });

      const count = await helper.countVersions(agentVId);
      expect(count).toBe(2);
    });

    it('deleteVersion', async () => {
      const dvId = crypto.randomUUID();

      await helper.createVersion({
        id: dvId,
        agent_id: agentVId,
        version_number: 1,
        name: 'V1',
        instructions: '',
        model: '{}',
        created_at: new Date(),
      });
      await helper.deleteVersion(dvId);
      expect(await helper.getVersion(dvId)).toBeNull();
    });

    it('deleteVersionsByParentId', async () => {
      await helper.createVersion({
        id: crypto.randomUUID(),
        agent_id: agentVId,
        version_number: 1,
        name: 'V1',
        instructions: '',
        model: '{}',
        created_at: new Date(),
      });
      await helper.createVersion({
        id: crypto.randomUUID(),
        agent_id: agentVId,
        version_number: 2,
        name: 'V2',
        instructions: '',
        model: '{}',
        created_at: new Date(),
      });

      await helper.deleteVersionsByParentId(agentVId);
      expect(await helper.countVersions(agentVId)).toBe(0);
    });

    it('listVersions with pagination', async () => {
      for (let i = 1; i <= 5; i++) {
        await helper.createVersion({
          id: crypto.randomUUID(),
          agent_id: agentVId,
          version_number: i,
          name: `V${i}`,
          instructions: '',
          model: '{}',
          created_at: new Date(),
        });
      }

      const result = await helper.listVersions(agentVId, { page: 0, perPage: 2 });
      expect(result.rows.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });
  });
});
