import type { DocumentRepo, MetadataRepo, SyncTargetRepo } from '@typhoon/db/repos';
import { resolveTemplateSchema } from '@typhoon/types';

import type { Result } from '../types';

export interface MetadataServiceDeps {
  metadataRepo: MetadataRepo;
  syncTargetRepo: SyncTargetRepo;
  documentRepo: DocumentRepo;
}

export class MetadataService {
  constructor(private deps: MetadataServiceDeps) {}

  // ── Field Groups ────────────────────────────────────────────────

  /** List all metadata field groups. */
  async listFieldGroups(): Promise<Result<unknown[]>> {
    const groups = await this.deps.metadataRepo.listFieldGroups();
    return { data: groups };
  }

  /** Get a metadata field group by ID. */
  async getFieldGroup(id: string): Promise<Result<unknown>> {
    const group = await this.deps.metadataRepo.findFieldGroupById(id);
    if (!group) return { error: 'not-found' };
    return { data: group };
  }

  /** Create a new metadata field group. */
  async createFieldGroup(input: {
    name: string;
    description?: string | null;
    fields: Record<string, unknown>;
  }): Promise<Result<{ group: unknown; _status: 201 }>> {
    const group = await this.deps.metadataRepo.createFieldGroup(input as never);
    return { data: { group, _status: 201 } };
  }

  /** Update a metadata field group. */
  async updateFieldGroup(
    id: string,
    input: Partial<{
      name: string;
      description: string | null;
      fields: Record<string, unknown>;
    }>,
  ): Promise<Result<unknown>> {
    const existing = await this.deps.metadataRepo.findFieldGroupById(id);
    if (!existing) return { error: 'not-found' };

    const updated = await this.deps.metadataRepo.updateFieldGroup(id, input as never);

    // Mark affected documents dirty if fields changed
    let affectedSyncTargetCount = 0;
    if (input.fields) {
      const templates = await this.deps.metadataRepo.findTemplatesByFieldGroupId(id);
      const templateIds = templates.map((t) => t.id);
      if (templateIds.length > 0) {
        const targets = await this.deps.syncTargetRepo.findByMetadataTemplateIds(templateIds);
        const targetIds = targets.map((t) => t.id);
        affectedSyncTargetCount = targetIds.length;
        await this.deps.documentRepo.markSearchMetaDirty(targetIds);
      }
    }

    return { data: { ...updated, affectedSyncTargetCount } };
  }

  /** Delete a metadata field group and remove references from templates. */
  async deleteFieldGroup(id: string): Promise<Result<{ ok: true }>> {
    const existing = await this.deps.metadataRepo.findFieldGroupById(id);
    if (!existing) return { error: 'not-found' };

    await this.deps.metadataRepo.deleteFieldGroup(id);
    return { data: { ok: true } };
  }

  // ── Templates ───────────────────────────────────────────────────

  /** List all templates with resolved effective schemas. */
  async listTemplates(): Promise<Result<unknown[]>> {
    const templates = await this.deps.metadataRepo.listTemplates();

    const effectiveSchemas = await this.deps.metadataRepo.resolveEffectiveSchemaBatch(templates);

    const results = templates.map((t, i) => Object.assign({}, t, { effectiveSchema: effectiveSchemas[i] }));

    return { data: results };
  }

  /** Get a template by ID with its effective schema and sync target count. */
  async getTemplate(id: string): Promise<Result<unknown>> {
    const template = await this.deps.metadataRepo.findTemplateById(id);
    if (!template) return { error: 'not-found' };

    // Resolve effective schema
    const groups =
      template.fieldGroupIds.length > 0
        ? await this.deps.metadataRepo.findFieldGroupsByIds(template.fieldGroupIds)
        : [];
    const effectiveSchema = resolveTemplateSchema(template, groups);

    // Count sync targets using this template
    const syncTargetCount = await this.deps.syncTargetRepo.countByMetadataTemplateId(id);

    return { data: { ...template, effectiveSchema, syncTargetCount } };
  }

  /** Create a new template after validating referenced field group IDs. */
  async createTemplate(input: {
    name: string;
    description?: string | null;
    fieldGroupIds: string[];
    customFields: Record<string, unknown>;
  }): Promise<Result<{ template: unknown; effectiveSchema: unknown; _status: 201 }>> {
    // Validate that all referenced group IDs exist
    if (input.fieldGroupIds.length > 0) {
      const existingGroups = await this.deps.metadataRepo.findFieldGroupsByIds(input.fieldGroupIds);
      const existingIds = new Set(existingGroups.map((g) => g.id));
      const missing = input.fieldGroupIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        return { error: `Field groups not found: ${missing.join(', ')}` };
      }
    }

    const template = await this.deps.metadataRepo.createTemplate(input as never);

    // Resolve effective schema for the new template
    const groups =
      template.fieldGroupIds.length > 0
        ? await this.deps.metadataRepo.findFieldGroupsByIds(template.fieldGroupIds)
        : [];
    const effectiveSchema = resolveTemplateSchema(template, groups);

    return { data: { template, effectiveSchema, _status: 201 } };
  }

  /** Update a template after validating referenced field group IDs. */
  async updateTemplate(
    id: string,
    input: Partial<{
      name: string;
      description: string | null;
      fieldGroupIds: string[];
      customFields: Record<string, unknown>;
    }>,
  ): Promise<Result<unknown>> {
    const existing = await this.deps.metadataRepo.findTemplateById(id);
    if (!existing) return { error: 'not-found' };

    // Validate group IDs if provided
    if (input.fieldGroupIds && input.fieldGroupIds.length > 0) {
      const existingGroups = await this.deps.metadataRepo.findFieldGroupsByIds(input.fieldGroupIds);
      const existingIds = new Set(existingGroups.map((g) => g.id));
      const missing = input.fieldGroupIds.filter((gid) => !existingIds.has(gid));
      if (missing.length > 0) {
        return { error: `Field groups not found: ${missing.join(', ')}` };
      }
    }

    const updated = await this.deps.metadataRepo.updateTemplate(id, input as never);

    // Mark affected documents dirty if schema-relevant fields changed
    let syncTargetCount = 0;
    if (input.fieldGroupIds || input.customFields) {
      const targets = await this.deps.syncTargetRepo.findByMetadataTemplateId(id);
      const targetIds = targets.map((t) => t.id);
      syncTargetCount = targetIds.length;
      await this.deps.documentRepo.markSearchMetaDirty(targetIds);
    } else {
      syncTargetCount = await this.deps.syncTargetRepo.countByMetadataTemplateId(id);
    }

    // Resolve effective schema for the updated template
    if (updated) {
      const groups =
        updated.fieldGroupIds.length > 0
          ? await this.deps.metadataRepo.findFieldGroupsByIds(updated.fieldGroupIds)
          : [];
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB types from Drizzle
      const effectiveSchema = resolveTemplateSchema(updated as any, groups as any);
      return { data: { ...updated, effectiveSchema, syncTargetCount } };
    }

    return { data: updated };
  }

  /** Delete a template. FK onDelete: 'set null' handles sync target references. */
  async deleteTemplate(id: string): Promise<Result<{ ok: true }>> {
    const existing = await this.deps.metadataRepo.findTemplateById(id);
    if (!existing) return { error: 'not-found' };

    await this.deps.metadataRepo.deleteTemplate(id);
    return { data: { ok: true } };
  }
}
