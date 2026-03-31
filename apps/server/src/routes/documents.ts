import { registerApiRoute } from '@mastra/core/server';
import { documents } from '@typhoon/db';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { requireAuth } from '../middleware/require-auth.js';

export const documentRoutes = [
  registerApiRoute('/v1/documents', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const syncTargetId = c.req.query('syncTargetId');
      const query = db.select().from(documents);
      const docs = syncTargetId ? await query.where(eq(documents.syncTargetId, syncTargetId)) : await query;
      return c.json(docs);
    },
  }),

  registerApiRoute('/v1/documents/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const id = c.req.param('id');
      const [doc] = await db.select().from(documents).where(eq(documents.id, id));
      if (!doc) return c.json({ error: 'Not found' }, 404);
      return c.json(doc);
    },
  }),
];
