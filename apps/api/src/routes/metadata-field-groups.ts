import { registerApiRoute } from '@mastra/core/server';
import { metadataFieldGroups, metadataTemplates } from '@typhoon/db';
import { createMetadataFieldGroupSchema, updateMetadataFieldGroupSchema } from '@typhoon/types';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth } from '../middleware/require-auth';

export const metadataFieldGroupRoutes = [
  registerApiRoute('/v1/metadata-field-groups', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const groups = await db.select().from(metadataFieldGroups);
      return c.json(groups);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const body = createMetadataFieldGroupSchema.parse(await c.req.json());
      const [group] = await db.insert(metadataFieldGroups).values(body).returning();
      return c.json(group, 201);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [group] = await db.select().from(metadataFieldGroups).where(eq(metadataFieldGroups.id, id));
      if (!group) return c.json({ error: 'Not found' }, 404);
      return c.json(group);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups/:id', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [existing] = await db.select().from(metadataFieldGroups).where(eq(metadataFieldGroups.id, id));
      if (!existing) return c.json({ error: 'Not found' }, 404);

      const body = updateMetadataFieldGroupSchema.parse(await c.req.json());
      const [updated] = await db
        .update(metadataFieldGroups)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(metadataFieldGroups.id, id))
        .returning();

      return c.json(updated);
    },
  }),

  registerApiRoute('/v1/metadata-field-groups/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [existing] = await db.select().from(metadataFieldGroups).where(eq(metadataFieldGroups.id, id));
      if (!existing) return c.json({ error: 'Not found' }, 404);

      // Remove this group's ID from all templates that reference it
      await db
        .update(metadataTemplates)
        .set({ updatedAt: new Date() })
        .where(drizzleSql`${metadataTemplates.fieldGroupIds}::jsonb @> ${JSON.stringify([id])}::jsonb`);

      // Use raw SQL to remove the group ID from the JSONB array
      await db.execute(
        drizzleSql`UPDATE metadata_templates SET field_group_ids = field_group_ids - ${id} WHERE field_group_ids::jsonb @> ${JSON.stringify([id])}::jsonb`,
      );

      await db.delete(metadataFieldGroups).where(eq(metadataFieldGroups.id, id));
      return c.json({ ok: true });
    },
  }),
];
