import type { MetadataSchema } from '@typhoon/types';
import { resolveTemplateSchema } from '@typhoon/types';
import { sql as drizzleSql, sql as dsql, eq, inArray } from 'drizzle-orm';

import type { Db } from '../client';
import { metadataFieldGroups } from '../schema/metadata-field-group';
import { metadataTemplates } from '../schema/metadata-template';

/** Data-access layer for metadata field groups and templates. */
export class MetadataRepo {
  constructor(private db: Db) {}

  // ── Effective schema resolution ─────────────────────────────────

  /**
   * Fetch a template and its referenced field groups, then merge into an
   * effective metadata schema. Returns `null` if the template doesn't exist.
   */
  async resolveEffectiveSchema(templateId: string) {
    const [template] = await this.db.select().from(metadataTemplates).where(eq(metadataTemplates.id, templateId));
    if (!template) return null;

    const groups =
      template.fieldGroupIds.length > 0
        ? await this.db
            .select()
            .from(metadataFieldGroups)
            .where(inArray(metadataFieldGroups.id, template.fieldGroupIds))
        : [];

    return resolveTemplateSchema(template, groups);
  }

  // ── Field Groups ────────────────────────────────────────────────

  /** List all field groups. */
  async listFieldGroups() {
    return this.db.select().from(metadataFieldGroups);
  }

  /** Find a field group by ID. */
  async findFieldGroupById(id: string) {
    const [row] = await this.db.select().from(metadataFieldGroups).where(eq(metadataFieldGroups.id, id));
    return row ?? null;
  }

  /** Insert a new field group and return the created row. */
  async createFieldGroup(data: typeof metadataFieldGroups.$inferInsert) {
    const [row] = await this.db.insert(metadataFieldGroups).values(data).returning();
    return row;
  }

  /** Update a field group by ID and return the updated row (or null). */
  async updateFieldGroup(id: string, data: Partial<typeof metadataFieldGroups.$inferInsert>) {
    const [row] = await this.db
      .update(metadataFieldGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(metadataFieldGroups.id, id))
      .returning();

    // Touch templates that reference this group (mirrors deleteFieldGroup pattern)
    await this.db
      .update(metadataTemplates)
      .set({ updatedAt: new Date() })
      .where(drizzleSql`${metadataTemplates.fieldGroupIds}::jsonb @> ${JSON.stringify([id])}::jsonb`);

    return row ?? null;
  }

  /** Find templates that reference a field group (by JSONB array containment). */
  async findTemplatesByFieldGroupId(fieldGroupId: string) {
    return this.db
      .select({ id: metadataTemplates.id })
      .from(metadataTemplates)
      .where(drizzleSql`${metadataTemplates.fieldGroupIds}::jsonb @> ${JSON.stringify([fieldGroupId])}::jsonb`);
  }

  /** Delete a field group by ID, removing its reference from all templates. */
  async deleteFieldGroup(id: string) {
    // Touch templates that reference this group (for updatedAt)
    await this.db
      .update(metadataTemplates)
      .set({ updatedAt: new Date() })
      .where(drizzleSql`${metadataTemplates.fieldGroupIds}::jsonb @> ${JSON.stringify([id])}::jsonb`);

    // Remove the group ID from the JSONB array in all templates
    await this.db.execute(
      drizzleSql`UPDATE metadata_templates SET field_group_ids = field_group_ids - ${id} WHERE field_group_ids::jsonb @> ${JSON.stringify([id])}::jsonb`,
    );

    await this.db.delete(metadataFieldGroups).where(eq(metadataFieldGroups.id, id));
  }

  // ── Templates ───────────────────────────────────────────────────

  /** List all templates. */
  async listTemplates() {
    return this.db.select().from(metadataTemplates);
  }

  /** Find a template by ID. */
  async findTemplateById(id: string) {
    const [row] = await this.db.select().from(metadataTemplates).where(eq(metadataTemplates.id, id));
    return row ?? null;
  }

  /** Insert a new template and return the created row. */
  async createTemplate(data: typeof metadataTemplates.$inferInsert) {
    const [row] = await this.db.insert(metadataTemplates).values(data).returning();
    return row;
  }

  /** Update a template by ID and return the updated row (or null). */
  async updateTemplate(id: string, data: Partial<typeof metadataTemplates.$inferInsert>) {
    const [row] = await this.db
      .update(metadataTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(metadataTemplates.id, id))
      .returning();
    return row ?? null;
  }

  /** Delete a template by ID. FK onDelete: 'set null' handles sync target references. */
  async deleteTemplate(id: string) {
    await this.db.delete(metadataTemplates).where(eq(metadataTemplates.id, id));
  }

  /** Find field groups by IDs. */
  async findFieldGroupsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(metadataFieldGroups).where(inArray(metadataFieldGroups.id, ids));
  }

  /**
   * Resolve effective schemas for multiple templates in a batch.
   * Fetches all referenced field groups in a single query.
   */
  async resolveEffectiveSchemaBatch(templates: Array<{ fieldGroupIds: string[]; customFields: MetadataSchema }>) {
    const allGroupIds = [...new Set(templates.flatMap((t) => t.fieldGroupIds))];
    const groups =
      allGroupIds.length > 0
        ? await this.db.select().from(metadataFieldGroups).where(inArray(metadataFieldGroups.id, allGroupIds))
        : [];

    return templates.map((t) => resolveTemplateSchema(t, groups));
  }

  // ── Agent metadata context ─────────────────────────────────────

  /**
   * Query distinct metadata field keys and their values across all non-deleted
   * documents. Used by the knowledge agent to understand available filters.
   */
  async getFieldValuesForAgent(): Promise<string | undefined> {
    const rows = await this.db.execute(dsql`
      SELECT kv.key, jsonb_agg(DISTINCT kv.value) FILTER (WHERE jsonb_typeof(kv.value) != 'null') AS values
      FROM documents d, jsonb_each(d.custom_metadata) AS kv(key, value)
      WHERE d.status != 'deleted' AND d.custom_metadata != '{}'::jsonb
      GROUP BY kv.key ORDER BY COUNT(DISTINCT d.id) DESC
    `);
    if (rows.length === 0) return undefined;

    return (rows as unknown as Array<{ key: string; values: unknown[] }>)
      .map((r) => {
        const vals = (r.values ?? []).map((v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)));
        return `${r.key}: ${vals.join(', ')}`;
      })
      .join(' | ');
  }
}
