import { registerApiRoute } from '@mastra/core/server';
import { feedback, messages, threads } from '@typhoon/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/require-auth.js';

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

const upsertFeedbackSchema = z.object({
  messageId: z.string().min(1),
  rating: z.enum(['positive', 'negative']).nullable(),
  comment: z.string().nullable().optional(),
});

export const feedbackRoutes = [
  // Upsert or delete feedback for a message
  registerApiRoute('/v1/feedback', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const body = upsertFeedbackSchema.parse(await c.req.json());

      // Resolve message externalId → internal row
      const [msg] = await db
        .select({ id: messages.id, threadId: messages.threadId })
        .from(messages)
        .where(eq(messages.externalId, body.messageId));

      if (!msg) return c.json({ error: 'Message not found' }, 404);

      const internalMessageId = msg.id;
      const internalThreadId = msg.threadId;

      // Delete case: rating is null → remove existing feedback
      if (body.rating === null) {
        await db.delete(feedback).where(and(eq(feedback.messageId, internalMessageId), eq(feedback.userId, userId)));
        return c.json({ deleted: true });
      }

      // Check for existing feedback
      const [existing] = await db
        .select({ id: feedback.id })
        .from(feedback)
        .where(and(eq(feedback.messageId, internalMessageId), eq(feedback.userId, userId)));

      if (existing) {
        // Update existing
        const [updated] = await db
          .update(feedback)
          .set({ rating: body.rating, comment: body.comment ?? null })
          .where(eq(feedback.id, existing.id))
          .returning();
        return c.json({ ...updated, messageId: body.messageId });
      }

      // Insert new
      const [entry] = await db
        .insert(feedback)
        .values({
          threadId: internalThreadId,
          messageId: internalMessageId,
          userId,
          rating: body.rating,
          comment: body.comment ?? null,
        })
        .returning();

      return c.json({ ...entry, messageId: body.messageId }, 201);
    },
  }),

  // List feedback — optionally filtered by threadId (external) for the current user
  registerApiRoute('/v1/feedback', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const threadExternalId = c.req.query('threadId');

      if (!threadExternalId) {
        // Admin: return all feedback
        const entries = await db.select().from(feedback);
        return c.json(entries);
      }

      // User-scoped: resolve thread externalId → internal, filter by user
      const userId = getUserId(c);
      const [thread] = await db
        .select({ id: threads.id })
        .from(threads)
        .where(eq(threads.externalId, threadExternalId));

      if (!thread) return c.json([]);

      const entries = await db
        .select({
          id: feedback.id,
          messageExternalId: messages.externalId,
          rating: feedback.rating,
          comment: feedback.comment,
          createdAt: feedback.createdAt,
        })
        .from(feedback)
        .innerJoin(messages, eq(feedback.messageId, messages.id))
        .where(and(eq(feedback.threadId, thread.id), eq(feedback.userId, userId)));

      // Map messageExternalId → messageId for the frontend
      return c.json(entries.map((e) => ({ ...e, messageId: e.messageExternalId, messageExternalId: undefined })));
    },
  }),
];
