import { registerApiRoute } from '@mastra/core/server';
import { messages, threads } from '@typhoon/db';
import { PgVector } from '@typhoon/db/drivers/pg';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, sql } from '../db';
import { requireAuth } from '../middleware/require-auth';
import { hydrateChunkSources } from './hydrate-chunks';

const createThreadSchema = z.object({
  title: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateThreadSchema = z.object({
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

/**
 * Known runtime serialization errors that Mastra may store as a tool's
 * `result` when the actual output cannot be JSON-stringified (e.g. cyclic
 * structures). These indicate a system-level failure, not a valid tool result.
 */
const SERIALIZATION_ERRORS = [
  'JSON.stringify cannot serialize cyclic structures.', // Bun
  'Converting circular structure to JSON', // Node
];

function isSerializationError(result: unknown): boolean {
  if (typeof result !== 'string') return false;
  return SERIALIZATION_ERRORS.some((e) => result.startsWith(e));
}

/**
 * Mastra persists tool calls in the legacy v4 part shape:
 *   { type: 'tool-invocation', toolInvocation: { state: 'call'|'result', toolName, args, result } }
 * AI SDK v6 (used by useChat) expects the static-tool shape:
 *   { type: 'tool-{toolName}', toolCallId, state: 'input-available'|'output-available'|'output-error', input, output }
 *
 * Two error paths must be handled:
 * 1. Tool throws → AI SDK emits 'output-error' → Mastra stores as state:'call'
 *    (losing the error distinction). In persisted messages 'call' means the
 *    tool never produced a result, so we map it to 'output-error'.
 * 2. Tool returns non-serialisable output → Mastra stores state:'result' with
 *    the runtime error message as the result. We detect known serialization
 *    error strings and map to 'output-error'.
 */
export function normalizeToolPart(part: unknown): unknown {
  if (typeof part !== 'object' || part === null) return part;
  const p = part as { type?: string; toolInvocation?: Record<string, unknown> };
  if (p.type !== 'tool-invocation' || !p.toolInvocation) return part;

  const inv = p.toolInvocation as {
    state?: string;
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
  };

  let state: string;
  if (inv.state === 'result') {
    state = isSerializationError(inv.result) ? 'output-error' : 'output-available';
  } else if (inv.state === 'call') {
    // In persisted messages, 'call' without a result means the tool errored —
    // Mastra converts AI SDK 'output-error' to v4 'call' during storage.
    state = 'output-error';
  } else {
    state = 'input-available';
  }

  return {
    type: `tool-${inv.toolName ?? 'unknown'}`,
    toolCallId: inv.toolCallId,
    state,
    input: inv.args,
    ...(state === 'output-available' ? { output: inv.result } : {}),
  };
}

/** Convert Mastra DB message content to AI SDK UIMessage format */
export function toUIMessage(msg: {
  externalId: string;
  role: string;
  content: Record<string, unknown>;
  createdAt: Date;
}) {
  const content = msg.content as { format?: number; parts?: unknown[]; content?: string };
  const parts = content.parts ?? [{ type: 'text', text: content.content ?? '' }];
  return {
    id: msg.externalId,
    role: msg.role,
    parts: parts.map(normalizeToolPart),
    createdAt: msg.createdAt,
  };
}

/** Map thread row to API response, exposing externalId as id */
export function toThreadResponse(row: typeof threads.$inferSelect) {
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

      const uiMessages = threadMessages.map(toUIMessage);
      await hydrateChunkSources(uiMessages, vectorStore);

      return c.json({
        ...toThreadResponse(thread),
        messages: uiMessages,
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
