import { ScorerDefinitionsStorage } from '@mastra/core/storage';
import type { Sql } from 'postgres';
import { VersionedStorageHelper } from './versioned.js';

export class DrizzleScorerDefinitionsStorage extends ScorerDefinitionsStorage {
  private helper: VersionedStorageHelper;

  constructor(sql: Sql) {
    super();
    this.helper = new VersionedStorageHelper(sql, {
      mainTable: 'scorer_definitions',
      versionsTable: 'scorer_definition_versions',
      entityIdColumn: 'scorer_definition_id',
    });
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.helper.dangerouslyClearAll();
  }
  async getById(id: string) {
    return this.helper.getById(id) as never;
  }
  async create(input: never) {
    const data =
      (input as { scorerDefinition: Record<string, unknown> }).scorerDefinition ?? (input as Record<string, unknown>);
    return this.helper.create({
      id: (data.id as string) ?? crypto.randomUUID(),
      status: (data.status as string) ?? 'draft',
      active_version_id: data.activeVersionId ?? null,
      author_id: data.authorId ?? null,
      metadata: data.metadata ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    }) as never;
  }
  async update(input: never) {
    const data = input as Record<string, unknown>;
    const sets: Record<string, unknown> = { updated_at: new Date() };
    if (data.status !== undefined) sets.status = data.status;
    if (data.activeVersionId !== undefined) sets.active_version_id = data.activeVersionId;
    if (data.metadata !== undefined) sets.metadata = data.metadata;
    return this.helper.update(data.id as string, sets) as never;
  }
  async delete(id: string) {
    await this.helper.delete(id);
  }
  async list(args?: never) {
    return this.helper.list(args as never) as never;
  }
  async createVersion(input: never) {
    return this.helper.createVersion(input as Record<string, unknown>) as never;
  }
  async getVersion(id: string) {
    return this.helper.getVersion(id) as never;
  }
  async getVersionByNumber(entityId: string, num: number) {
    return this.helper.getVersionByNumber(entityId, num) as never;
  }
  async getLatestVersion(entityId: string) {
    return this.helper.getLatestVersion(entityId) as never;
  }
  async listVersions(input: never) {
    const data = input as Record<string, unknown>;
    return this.helper.listVersions(data.scorerDefinitionId as string, data as never) as never;
  }
  async deleteVersion(id: string) {
    await this.helper.deleteVersion(id);
  }
  async deleteVersionsByParentId(entityId: string) {
    await this.helper.deleteVersionsByParentId(entityId);
  }
  async countVersions(entityId: string) {
    return this.helper.countVersions(entityId);
  }
}
