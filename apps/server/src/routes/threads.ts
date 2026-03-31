import type { MastraDBMessage } from '@mastra/core/agent';
import { AIV5Adapter } from '@mastra/core/agent/message-list';
import { registerApiRoute } from '@mastra/core/server';
import { messages, threads } from '@typhoon/db';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/require-auth.js';

const createThreadSchema = z.object({
  title: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateThreadSchema = z.object({
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

/** Convert Mastra DB message content to AI SDK V5 UIMessage format */
function toUIMessage(msg: { externalId: string; role: string; content: Record<string, unknown>; createdAt: Date }) {
  const dbMsg = {
    id: msg.externalId,
    role: msg.role as MastraDBMessage['role'],
    content: msg.content as MastraDBMessage['content'],
    createdAt: msg.createdAt,
  };
  const uiMsg = AIV5Adapter.toUIMessage(dbMsg);
  return { ...uiMsg, createdAt: msg.createdAt };
}

/** Map thread row to API response, exposing externalId as id */
function toThreadResponse(row: typeof threads.$inferSelect) {
  return {
    id: row.externalId,
    resourceId: row.resourceId,
    title: row.title,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const threadRoutes = [
  // List threads for the authenticated user
  registerApiRoute('/v1/threads', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const page = Number(c.req.query('page') ?? '0');
      const perPage = Number(c.req.query('perPage') ?? '20');
      const offset = page * perPage;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(threads)
          .where(eq(threads.resourceId, userId))
          .orderBy(desc(threads.updatedAt))
          .limit(perPage)
          .offset(offset),
        db.select({ total: count() }).from(threads).where(eq(threads.resourceId, userId)),
      ]);

      return c.json({
        threads: rows.map(toThreadResponse),
        total,
        page,
        perPage,
        hasMore: offset + perPage < total,
      });
    },
  }),

  // Get a single thread with its messages
  registerApiRoute('/v1/threads/:threadId', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const threadId = c.req.param('threadId');

      const [thread] = await db
        .select()
        .from(threads)
        .where(and(eq(threads.externalId, threadId), eq(threads.resourceId, userId)));

      if (!thread) return c.json({ error: 'Not found' }, 404);

      const threadMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.threadId, thread.id))
        .orderBy(asc(messages.createdAt));

      return c.json({
        ...toThreadResponse(thread),
        messages: threadMessages.map(toUIMessage),
      });
    },
  }),

  // Create a new thread
  registerApiRoute('/v1/threads', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const body = createThreadSchema.parse(await c.req.json());

      const [thread] = await db
        .insert(threads)
        .values({
          externalId: crypto.randomUUID(),
          resourceId: userId,
          title: body.title,
          metadata: body.metadata ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return c.json(toThreadResponse(thread), 201);
    },
  }),

  // Update a thread
  registerApiRoute('/v1/threads/:threadId', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const threadId = c.req.param('threadId');
      const body = updateThreadSchema.parse(await c.req.json());

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.metadata !== undefined) updates.metadata = body.metadata;

      const [updated] = await db
        .update(threads)
        .set(updates)
        .where(and(eq(threads.externalId, threadId), eq(threads.resourceId, userId)))
        .returning();

      if (!updated) return c.json({ error: 'Not found' }, 404);
      return c.json(toThreadResponse(updated));
    },
  }),

  // Delete a thread and its messages
  registerApiRoute('/v1/threads/:threadId', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const threadId = c.req.param('threadId');

      const [thread] = await db
        .select({ id: threads.id })
        .from(threads)
        .where(and(eq(threads.externalId, threadId), eq(threads.resourceId, userId)));

      if (!thread) return c.json({ error: 'Not found' }, 404);

      await db.transaction(async (tx) => {
        await tx.delete(messages).where(eq(messages.threadId, thread.id));
        await tx.delete(threads).where(eq(threads.id, thread.id));
      });

      return c.json({ ok: true });
    },
  }),
];
