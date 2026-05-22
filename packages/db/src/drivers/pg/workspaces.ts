import { WorkspacesStorage } from '@mastra/core/storage';

import type { Db } from '../../client';
import { workspaces, workspaceVersions } from '../../schema/versioned/workspaces';
import { createVersionedDriver } from './versioned';

const driver = createVersionedDriver({
  mainTable: workspaces,
  versionTable: workspaceVersions,
  mainId: workspaces.id,
  versionEntityId: workspaceVersions.workspaceId,
  versionNumber: workspaceVersions.versionNumber,
  authorId: workspaces.authorId,
  createdAt: workspaces.createdAt,
  updatedAt: workspaces.updatedAt,
  versionId: workspaceVersions.id,
  versionCreatedAt: workspaceVersions.createdAt,
});

export class DrizzleWorkspacesStorage extends WorkspacesStorage {
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
    const { workspace } = input as { workspace: Record<string, unknown> };
    return driver.create(this.db, {
      id: (workspace.id as string) ?? crypto.randomUUID(),
      status: (workspace.status as string) ?? 'draft',
      activeVersionId: workspace.activeVersionId ?? null,
      authorId: workspace.authorId ?? null,
      metadata: workspace.metadata ?? null,
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
    return driver.listVersions(this.db, data.workspaceId as string, data as never) as never;
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
