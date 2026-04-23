import { MCPServersStorage } from '@mastra/core/storage';
import type { Db } from '../../client';
import { mcpServers, mcpServerVersions } from '../../schema/versioned/mcp-servers';
import { createVersionedDriver } from './versioned';

const driver = createVersionedDriver({
  mainTable: mcpServers,
  versionTable: mcpServerVersions,
  mainId: mcpServers.id,
  versionEntityId: mcpServerVersions.mcpServerId,
  versionNumber: mcpServerVersions.versionNumber,
  authorId: mcpServers.authorId,
  createdAt: mcpServers.createdAt,
  updatedAt: mcpServers.updatedAt,
  versionId: mcpServerVersions.id,
  versionCreatedAt: mcpServerVersions.createdAt,
});

export class DrizzleMCPServersStorage extends MCPServersStorage {
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
    const { mcpServer } = input as { mcpServer: Record<string, unknown> };
    return driver.create(this.db, {
      id: (mcpServer.id as string) ?? crypto.randomUUID(),
      status: (mcpServer.status as string) ?? 'draft',
      activeVersionId: mcpServer.activeVersionId ?? null,
      authorId: mcpServer.authorId ?? null,
      metadata: mcpServer.metadata ?? null,
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
    return driver.listVersions(this.db, data.mcpServerId as string, data as never) as never;
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
