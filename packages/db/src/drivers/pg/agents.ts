import { AgentsStorage } from '@mastra/core/storage';
import type { Db } from '../../client';
import { agents, agentVersions } from '../../schema/versioned/agents';
import { createVersionedDriver } from './versioned';

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

export class DrizzleAgentsStorage extends AgentsStorage {
  constructor(private db: Db) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await driver.dangerouslyClearAll(this.db);
  }
  async getById(id: string) {
    return driver.getById(this.db, id) as never;
  }
  async create(input: never) {
    const { agent } = input as { agent: Record<string, unknown> };
    return driver.create(this.db, {
      id: (agent.id as string) ?? crypto.randomUUID(),
      status: (agent.status as string) ?? 'draft',
      activeVersionId: agent.activeVersionId ?? null,
      authorId: agent.authorId ?? null,
      metadata: agent.metadata ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as never;
  }
  async update(input: never) {
    const data = input as Record<string, unknown>;
    const id = data.id as string;
    const sets: Record<string, unknown> = {};
    if (data.status !== undefined) sets.status = data.status;
    if (data.activeVersionId !== undefined) sets.activeVersionId = data.activeVersionId;
    if (data.metadata !== undefined) sets.metadata = data.metadata;
    return driver.update(this.db, id, sets) as never;
  }
  async delete(id: string) {
    await driver.delete(this.db, id);
  }
  async list(args?: never) {
    return driver.list(this.db, args as never) as never;
  }
  async createVersion(input: never) {
    return driver.createVersion(this.db, input as Record<string, unknown>) as never;
  }
  async getVersion(id: string) {
    return driver.getVersion(this.db, id) as never;
  }
  async getVersionByNumber(entityId: string, num: number) {
    return driver.getVersionByNumber(this.db, entityId, num) as never;
  }
  async getLatestVersion(entityId: string) {
    return driver.getLatestVersion(this.db, entityId) as never;
  }
  async listVersions(input: never) {
    const data = input as Record<string, unknown>;
    return driver.listVersions(this.db, data.agentId as string, data as never) as never;
  }
  async deleteVersion(id: string) {
    await driver.deleteVersion(this.db, id);
  }
  async deleteVersionsByParentId(entityId: string) {
    await driver.deleteVersionsByParentId(this.db, entityId);
  }
  async countVersions(entityId: string) {
    return driver.countVersions(this.db, entityId);
  }
}
