import { registerApiRoute } from '@mastra/core/server';
import { metadataFieldGroups, metadataTemplates, syncTargets } from '@typhoon/db';
import { createMetadataTemplateSchema, resolveTemplateSchema, updateMetadataTemplateSchema } from '@typhoon/types';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth } from '../middleware/require-auth';

/** Resolve a template's effective schema by merging its groups + custom fields. */
async function resolveEffectiveSchema(template: { fieldGroupIds: string[]; customFields: Record<string, unknown> }) {
  const groups =
    template.fieldGroupIds.length > 0
      ? await db.select().from(metadataFieldGroups).where(inArray(metadataFieldGroups.id, template.fieldGroupIds))
      : [];

  // biome-ignore lint/suspicious/noExplicitAny: JSONB types
  return resolveTemplateSchema(template as any, groups as any);
}

export const metadataTemplateRoutes = [
  registerApiRoute('/v1/metadata-templates', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const templates = await db.select().from(metadataTemplates);

      // Resolve effective schemas for all templates
      const allGroupIds = [...new Set(templates.flatMap((t) => t.fieldGroupIds))];
      const groups =
        allGroupIds.length > 0
          ? await db.select().from(metadataFieldGroups).where(inArray(metadataFieldGroups.id, allGroupIds))
          : [];

      const results = templates.map((t) => ({
        ...t,
        // biome-ignore lint/suspicious/noExplicitAny: JSONB types
        effectiveSchema: resolveTemplateSchema(t as any, groups as any),
      }));

      return c.json(results);
    },
  }),

  registerApiRoute('/v1/metadata-templates', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = createMetadataTemplateSchema.parse(await c.req.json());

      // Validate that all referenced group IDs exist
      if (body.fieldGroupIds.length > 0) {
        const existingGroups = await db
          .select({ id: metadataFieldGroups.id })
          .from(metadataFieldGroups)
          .where(inArray(metadataFieldGroups.id, body.fieldGroupIds));
        const existingIds = new Set(existingGroups.map((g) => g.id));
        const missing = body.fieldGroupIds.filter((id) => !existingIds.has(id));
        if (missing.length > 0) {
          return c.json({ error: `Field groups not found: ${missing.join(', ')}` }, 400);
        }
      }

      const [template] = await db.insert(metadataTemplates).values(body).returning();
      const effectiveSchema = await resolveEffectiveSchema(template);

      return c.json({ ...template, effectiveSchema }, 201);
    },
  }),

  registerApiRoute('/v1/metadata-templates/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [template] = await db.select().from(metadataTemplates).where(eq(metadataTemplates.id, id));
      if (!template) return c.json({ error: 'Not found' }, 404);

      const effectiveSchema = await resolveEffectiveSchema(template);

      // Count sync targets using this template
      const targets = await db
        .select({ id: syncTargets.id })
        .from(syncTargets)
        .where(eq(syncTargets.metadataTemplateId, id));

      return c.json({ ...template, effectiveSchema, syncTargetCount: targets.length });
    },
  }),

  registerApiRoute('/v1/metadata-templates/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [existing] = await db.select().from(metadataTemplates).where(eq(metadataTemplates.id, id));
      if (!existing) return c.json({ error: 'Not found' }, 404);

      const body = updateMetadataTemplateSchema.parse(await c.req.json());

      // Validate group IDs if provided
      if (body.fieldGroupIds && body.fieldGroupIds.length > 0) {
        const existingGroups = await db
          .select({ id: metadataFieldGroups.id })
          .from(metadataFieldGroups)
          .where(inArray(metadataFieldGroups.id, body.fieldGroupIds));
        const existingIds = new Set(existingGroups.map((g) => g.id));
        const missing = body.fieldGroupIds.filter((gid) => !existingIds.has(gid));
        if (missing.length > 0) {
          return c.json({ error: `Field groups not found: ${missing.join(', ')}` }, 400);
        }
      }

      const [updated] = await db
        .update(metadataTemplates)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(metadataTemplates.id, id))
        .returning();

      const effectiveSchema = await resolveEffectiveSchema(updated);
      return c.json({ ...updated, effectiveSchema });
    },
  }),

  registerApiRoute('/v1/metadata-templates/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [existing] = await db.select().from(metadataTemplates).where(eq(metadataTemplates.id, id));
      if (!existing) return c.json({ error: 'Not found' }, 404);

      // FK onDelete: 'set null' handles clearing sync target references
      await db.delete(metadataTemplates).where(eq(metadataTemplates.id, id));
      return c.json({ ok: true });
    },
  }),
];
