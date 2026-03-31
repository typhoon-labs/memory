import type { MastraMessageContentV2 } from '@mastra/core/agent';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import type {
  StorageCloneThreadInput,
  StorageCloneThreadOutput,
  StorageListMessagesInput,
  StorageListMessagesOutput,
  StorageListThreadsInput,
  StorageListThreadsOutput,
  StorageResourceType,
} from '@mastra/core/storage';
import { MemoryStorage } from '@mastra/core/storage';
import type { Db } from '@typhoon/db';
import { messages, resources, threads } from '@typhoon/db';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { sanitizeKey } from '../vector/filter.js';

export class DrizzleMemoryStorage extends MemoryStorage {
  override readonly supportsObservationalMemory = false;
  private db: Db;

  constructor(config: { db: Db }) {
    super();
    this.db = config.db;
  }

  async init(): Promise<void> {}

  async dangerouslyClearAll(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(messages);
      await tx.delete(threads);
      await tx.delete(resources);
    });
  }

  // ── ID Resolution ─────────────────────────────────────────────────────
  // Mastra uses non-UUID IDs (compound strings, nanoids). We store those in
  // external_id and use an internal uuid PK for FK relationships.

  private async resolveThreadId(externalId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: threads.id })
      .from(threads)
      .where(eq(threads.externalId, externalId));
    return row?.id ?? null;
  }

  private async resolveThreadIds(externalIds: string[]): Promise<Map<string, string>> {
    if (externalIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: threads.id, externalId: threads.externalId })
      .from(threads)
      .where(inArray(threads.externalId, externalIds));
    return new Map(rows.map((r) => [r.externalId, r.id]));
  }

  private async resolveMessageIds(externalIds: string[]): Promise<Map<string, string>> {
    if (externalIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: messages.id, externalId: messages.externalId })
      .from(messages)
      .where(inArray(messages.externalId, externalIds));
    return new Map(rows.map((r) => [r.externalId, r.id]));
  }

  // ── Threads ────────────────────────────────────────────────────────────

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    const [row] = await this.db.select().from(threads).where(eq(threads.externalId, threadId));
    return row ? this.mapThread(row) : null;
  }

  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    const [row] = await this.db
      .insert(threads)
      .values({
        externalId: thread.id,
        resourceId: thread.resourceId,
        title: thread.title ?? '',
        metadata: thread.metadata ?? {},
        createdAt: thread.createdAt ?? new Date(),
        updatedAt: thread.updatedAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: threads.externalId,
        set: {
          title: thread.title ?? '',
          metadata: thread.metadata ?? {},
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error('Failed to save thread');
    return this.mapThread(row);
  }

  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    const [row] = await this.db
      .update(threads)
      .set({ title, metadata, updatedAt: new Date() })
      .where(eq(threads.externalId, id))
      .returning();
    if (!row) throw new Error(`Thread ${id} not found`);
    return this.mapThread(row);
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    const internalId = await this.resolveThreadId(threadId);
    if (!internalId) return;
    await this.db.transaction(async (tx) => {
      await tx.delete(messages).where(eq(messages.threadId, internalId));
      await tx.delete(threads).where(eq(threads.id, internalId));
    });
  }

  async listThreads(args: StorageListThreadsInput): Promise<StorageListThreadsOutput> {
    const page = args.page ?? 0;
    const perPage = args.perPage ?? 100;
    const { field, direction } = this.parseOrderBy(args.orderBy);
    const orderFn = direction === 'ASC' ? asc : desc;
    const orderCol = field === 'updatedAt' ? threads.updatedAt : threads.createdAt;

    const conditions = [];
    if (args.filter?.resourceId) {
      conditions.push(eq(threads.resourceId, args.filter.resourceId));
    }
    if (args.filter?.metadata) {
      for (const [key, value] of Object.entries(args.filter.metadata)) {
        const safeKey = sanitizeKey(key);
        conditions.push(sql`${threads.metadata}->>${safeKey} = ${String(value)}`);
      }
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await this.db.select({ count: sql<number>`count(*)::int` }).from(threads).where(where);
    const total = countRow?.count ?? 0;

    let query = this.db.select().from(threads).where(where).orderBy(orderFn(orderCol)).$dynamic();
    if (perPage !== false) {
      query = query.limit(perPage).offset(page * perPage);
    }
    const rows = await query;

    return {
      threads: rows.map((r) => this.mapThread(r)),
      total,
      page,
      perPage: perPage === false ? false : perPage,
      hasMore: perPage !== false && (page + 1) * perPage < total,
    };
  }

  // ── Messages ───────────────────────────────────────────────────────────

  async listMessages(args: StorageListMessagesInput): Promise<StorageListMessagesOutput> {
    const page = args.page ?? 0;
    const perPage = args.perPage ?? 40;
    const externalThreadIds = Array.isArray(args.threadId) ? args.threadId : [args.threadId];

    // Resolve external thread IDs → internal uuids
    const threadMap = await this.resolveThreadIds(externalThreadIds);
    const internalThreadIds = [...threadMap.values()];
    if (internalThreadIds.length === 0) {
      return { messages: [], total: 0, page, perPage: perPage === false ? false : perPage, hasMore: false };
    }

    const conditions = [inArray(messages.threadId, internalThreadIds)];

    if (args.resourceId) {
      conditions.push(eq(messages.resourceId, args.resourceId));
    }
    if (args.filter?.dateRange?.start) {
      const op = args.filter.dateRange.startExclusive ? gt : gte;
      conditions.push(op(messages.createdAt, args.filter.dateRange.start));
    }
    if (args.filter?.dateRange?.end) {
      const op = args.filter.dateRange.endExclusive ? lt : lte;
      conditions.push(op(messages.createdAt, args.filter.dateRange.end));
    }

    const where = and(...conditions);

    const orderDirection = args.orderBy?.direction === 'DESC' ? desc : asc;
    const allRows = await this.db.select().from(messages).where(where).orderBy(orderDirection(messages.createdAt));

    // Handle include (semantic recall — include specific messages with surrounding context)
    let includeRows: typeof allRows = [];
    if (args.include && args.include.length > 0) {
      const includeExternalIds = args.include.map((i) => i.id);
      const includeMap = await this.resolveMessageIds(includeExternalIds);
      const includeInternalIds = [...includeMap.values()];
      if (includeInternalIds.length > 0) {
        includeRows = await this.db
          .select()
          .from(messages)
          .where(inArray(messages.id, includeInternalIds))
          .orderBy(asc(messages.createdAt));
      }
    }

    const total = allRows.length;
    let paged: typeof allRows;
    if (perPage === false) {
      paged = allRows;
    } else if (perPage === 0 && args.include) {
      paged = [];
    } else {
      paged = allRows.slice(page * perPage, page * perPage + perPage);
    }

    // Merge included messages, deduplicating by id
    const seenIds = new Set(paged.map((r) => r.id));
    for (const row of includeRows) {
      if (!seenIds.has(row.id)) {
        paged.push(row);
        seenIds.add(row.id);
      }
    }

    // Sort merged results by createdAt
    paged.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return {
      messages: paged.map((r) => this.mapMessage(r)),
      total,
      page,
      perPage: perPage === false ? false : perPage,
      hasMore: perPage !== false && perPage !== 0 && (page + 1) * perPage < total,
    };
  }

  async listMessagesById({ messageIds }: { messageIds: string[] }): Promise<{ messages: MastraDBMessage[] }> {
    if (messageIds.length === 0) return { messages: [] };
    // messageIds from Mastra are external IDs
    const idMap = await this.resolveMessageIds(messageIds);
    const internalIds = [...idMap.values()];
    if (internalIds.length === 0) return { messages: [] };
    const rows = await this.db
      .select()
      .from(messages)
      .where(inArray(messages.id, internalIds))
      .orderBy(asc(messages.createdAt));
    return { messages: rows.map((r) => this.mapMessage(r)) };
  }

  async saveMessages(args: { messages: MastraDBMessage[] }): Promise<{ messages: MastraDBMessage[] }> {
    if (args.messages.length === 0) return { messages: [] };

    // Resolve thread external IDs → internal uuids
    const uniqueThreadIds = [...new Set(args.messages.map((m) => m.threadId).filter(Boolean) as string[])];
    const threadMap = await this.resolveThreadIds(uniqueThreadIds);

    const rows = await this.db
      .insert(messages)
      .values(
        args.messages.map((msg) => ({
          externalId: msg.id,
          threadId: threadMap.get(msg.threadId!) ?? msg.threadId!,
          role: msg.role,
          type: msg.type ?? 'text',
          content: msg.content as Record<string, unknown>,
          resourceId: msg.resourceId ?? null,
          createdAt: msg.createdAt ?? new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: messages.externalId,
        set: {
          content: sql<Record<string, unknown>>`EXCLUDED.content`,
          role: sql<string>`EXCLUDED.role`,
          type: sql<string>`EXCLUDED.type`,
        },
      })
      .returning();

    return { messages: rows.map((r: typeof messages.$inferSelect) => this.mapMessage(r)) };
  }

  async updateMessages(args: {
    messages: (Partial<Omit<MastraDBMessage, 'createdAt'>> & {
      id: string;
      content?: {
        metadata?: MastraMessageContentV2['metadata'];
        content?: MastraMessageContentV2['content'];
      };
    })[];
  }): Promise<MastraDBMessage[]> {
    const updated: MastraDBMessage[] = [];

    for (const msg of args.messages) {
      // Fetch current message by external ID to merge content
      const [current] = await this.db.select().from(messages).where(eq(messages.externalId, msg.id));
      if (!current) continue;

      const currentContent = current.content as Record<string, unknown>;
      const newContent = msg.content ? { ...currentContent, ...msg.content } : currentContent;

      const [row] = await this.db
        .update(messages)
        .set({
          ...(msg.role ? { role: msg.role } : {}),
          ...(msg.type ? { type: msg.type } : {}),
          content: newContent,
        })
        .where(eq(messages.id, current.id))
        .returning();

      if (row) updated.push(this.mapMessage(row));
    }

    return updated;
  }

  override async deleteMessages(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    // messageIds from Mastra are external IDs
    const idMap = await this.resolveMessageIds(messageIds);
    const internalIds = [...idMap.values()];
    if (internalIds.length === 0) return;
    await this.db.delete(messages).where(inArray(messages.id, internalIds));
  }

  // ── Resources ──────────────────────────────────────────────────────────

  override async getResourceById({ resourceId }: { resourceId: string }): Promise<StorageResourceType | null> {
    const [row] = await this.db.select().from(resources).where(eq(resources.externalId, resourceId));
    if (!row) return null;
    return {
      id: row.externalId,
      workingMemory: row.workingMemory ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  override async saveResource({ resource }: { resource: StorageResourceType }): Promise<StorageResourceType> {
    const [row] = await this.db
      .insert(resources)
      .values({
        externalId: resource.id,
        workingMemory: resource.workingMemory ?? null,
        metadata: (resource.metadata as Record<string, unknown>) ?? {},
        createdAt: resource.createdAt ?? new Date(),
        updatedAt: resource.updatedAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: resources.externalId,
        set: {
          workingMemory: resource.workingMemory ?? null,
          metadata: (resource.metadata as Record<string, unknown>) ?? {},
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      id: row?.externalId,
      workingMemory: row?.workingMemory ?? undefined,
      metadata: (row?.metadata as Record<string, unknown>) ?? undefined,
      createdAt: row?.createdAt,
      updatedAt: row?.updatedAt,
    };
  }

  override async updateResource({
    resourceId,
    workingMemory,
    metadata,
  }: {
    resourceId: string;
    workingMemory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StorageResourceType> {
    const now = new Date();
    const setFields: Record<string, unknown> = { updatedAt: now };
    if (workingMemory !== undefined) setFields.workingMemory = workingMemory;
    if (metadata !== undefined) setFields.metadata = metadata;

    const [row] = await this.db
      .insert(resources)
      .values({
        externalId: resourceId,
        workingMemory: workingMemory ?? null,
        metadata: (metadata as Record<string, unknown>) ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: resources.externalId,
        set: setFields,
      })
      .returning();

    return {
      id: row?.externalId,
      workingMemory: row?.workingMemory ?? undefined,
      metadata: (row?.metadata as Record<string, unknown>) ?? undefined,
      createdAt: row?.createdAt,
      updatedAt: row?.updatedAt,
    };
  }

  // ── Clone ──────────────────────────────────────────────────────────────

  override async cloneThread(args: StorageCloneThreadInput): Promise<StorageCloneThreadOutput> {
    const source = await this.getThreadById({ threadId: args.sourceThreadId });
    if (!source) throw new Error(`Thread ${args.sourceThreadId} not found`);

    const newExternalId = args.newThreadId ?? crypto.randomUUID();
    const cloneMetadata = {
      ...(args.metadata ?? {}),
      sourceThreadId: args.sourceThreadId,
      clonedAt: new Date(),
    };

    const newThread = await this.saveThread({
      thread: {
        id: newExternalId,
        resourceId: args.resourceId ?? source.resourceId,
        title: args.title ?? source.title,
        metadata: cloneMetadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Clone messages
    const { messages: sourceMessages } = await this.listMessages({
      threadId: args.sourceThreadId,
      perPage: false,
    });

    const clonedMessages: MastraDBMessage[] = sourceMessages.map((msg) => ({
      ...msg,
      id: crypto.randomUUID(),
      threadId: newExternalId,
    }));

    const { messages: saved } = await this.saveMessages({ messages: clonedMessages });

    return { thread: newThread, clonedMessages: saved };
  }

  // ── Mappers ────────────────────────────────────────────────────────────

  private mapThread(row: typeof threads.$inferSelect): StorageThreadType {
    return {
      id: row.externalId,
      title: row.title,
      resourceId: row.resourceId,
      metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapMessage(row: typeof messages.$inferSelect): MastraDBMessage {
    return {
      id: row.externalId,
      threadId: row.threadId,
      role: row.role as MastraDBMessage['role'],
      type: row.type,
      content: row.content as MastraDBMessage['content'],
      resourceId: row.resourceId ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
