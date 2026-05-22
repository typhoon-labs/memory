import type { PgVector } from '@typhoon/db/drivers/pg';
import type { MessageRepo, ThreadRepo } from '@typhoon/db/repos';

import type { Result } from '../types';
import { hydrateChunkSources } from './hydrate-chunks';

// ---------------------------------------------------------------------------
// Shared helpers — exported for use by other services/routes (e.g. reviews)
// ---------------------------------------------------------------------------

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
 * 1. Tool throws -> AI SDK emits 'output-error' -> Mastra stores as state:'call'
 *    (losing the error distinction). In persisted messages 'call' means the
 *    tool never produced a result, so we map it to 'output-error'.
 * 2. Tool returns non-serialisable output -> Mastra stores state:'result' with
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

/**
 * Messages injected by Mastra's PrefillErrorHandler for retry recovery.
 * These are stored as `role: 'user'` with a `systemReminder` metadata marker
 * and should never be shown in the UI.
 */
export function isSystemReminder(msg: { content: Record<string, unknown> }): boolean {
  const content = msg.content as { metadata?: { systemReminder?: unknown } };
  return content?.metadata?.systemReminder !== null && content?.metadata?.systemReminder !== undefined;
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
export function toThreadResponse(row: {
  externalId: string;
  resourceId: string;
  title: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.externalId,
    resourceId: row.resourceId,
    title: row.title,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ThreadServiceDeps {
  threadRepo: ThreadRepo;
  messageRepo: MessageRepo;
  vectorStore: PgVector;
}

export class ThreadService {
  constructor(private deps: ThreadServiceDeps) {}

  /** List threads for a specific user with pagination. */
  async listThreads(input: { userId: string; page: number; perPage: number }): Promise<
    Result<{
      threads: ReturnType<typeof toThreadResponse>[];
      total: number;
      page: number;
      perPage: number;
      hasMore: boolean;
    }>
  > {
    const offset = input.page * input.perPage;
    const { rows, total } = await this.deps.threadRepo.listByResourceId(input.userId, {
      limit: input.perPage,
      offset,
    });

    return {
      data: {
        threads: rows.map(toThreadResponse),
        total,
        page: input.page,
        perPage: input.perPage,
        hasMore: offset + input.perPage < total,
      },
    };
  }

  /** Get a single thread with its messages, scoped to a user. */
  async getThread(input: { threadId: string; userId: string }): Promise<
    Result<
      ReturnType<typeof toThreadResponse> & {
        messages: ReturnType<typeof toUIMessage>[];
      }
    >
  > {
    const thread = await this.deps.threadRepo.findFullByExternalId(input.threadId, input.userId);
    if (!thread) return { error: 'not-found' };

    const threadMessages = await this.deps.messageRepo.listByThreadId(thread.id);
    const uiMessages = threadMessages.filter((msg) => !isSystemReminder(msg)).map(toUIMessage);
    await hydrateChunkSources(uiMessages, this.deps.vectorStore);

    return {
      data: {
        ...toThreadResponse(thread),
        messages: uiMessages,
      },
    };
  }

  /** Create a new thread. */
  async createThread(input: {
    userId: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<Result<ReturnType<typeof toThreadResponse>>> {
    const thread = await this.deps.threadRepo.create({
      externalId: crypto.randomUUID(),
      resourceId: input.userId,
      title: input.title,
      metadata: input.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { data: toThreadResponse(thread) };
  }

  /** Update a thread (title and/or metadata). */
  async updateThread(input: {
    threadId: string;
    userId: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<ReturnType<typeof toThreadResponse>>> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const updated = await this.deps.threadRepo.update(input.threadId, input.userId, updates);
    if (!updated) return { error: 'not-found' };

    return { data: toThreadResponse(updated) };
  }

  /** Delete a thread and its messages. */
  async deleteThread(input: { threadId: string; userId: string }): Promise<Result<{ ok: true }>> {
    const thread = await this.deps.threadRepo.findFullByExternalId(input.threadId, input.userId);
    if (!thread) return { error: 'not-found' };

    await this.deps.messageRepo.deleteByThreadId(thread.id);
    await this.deps.threadRepo.delete(thread.id);

    return { data: { ok: true } };
  }
}
