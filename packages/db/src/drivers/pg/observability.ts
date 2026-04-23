import { ObservabilityStorage } from '@mastra/core/storage';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../client';
import { aiSpans } from '../../schema/observability';

export class DrizzleObservabilityStorage extends ObservabilityStorage {
  constructor(private db: Db) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.db.delete(aiSpans);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async createSpan(args: any) {
    await this.insertSpan(this.db, args);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async updateSpan(args: any) {
    await this.updateSpanRow(this.db, args);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  private async insertSpan(db: Db, args: any) {
    const s = args.span ?? args;
    await db
      .insert(aiSpans)
      .values({
        id: s.id ?? crypto.randomUUID(),
        traceId: s.traceId,
        spanId: s.spanId,
        parentSpanId: s.parentSpanId ?? null,
        name: s.name,
        scope: s.scope ?? null,
        spanType: s.spanType,
        isEvent: s.isEvent ?? false,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        attributes: s.attributes ?? null,
        metadata: s.metadata ?? null,
        links: s.links ?? null,
        input: s.input ?? null,
        output: s.output ?? null,
        error: s.error ?? null,
        tags: s.tags ?? null,
        entityType: s.entityType ?? null,
        entityId: s.entityId ?? null,
        entityName: s.entityName ?? null,
        parentEntityType: s.parentEntityType ?? null,
        parentEntityId: s.parentEntityId ?? null,
        parentEntityName: s.parentEntityName ?? null,
        rootEntityType: s.rootEntityType ?? null,
        rootEntityId: s.rootEntityId ?? null,
        rootEntityName: s.rootEntityName ?? null,
        runId: s.runId ?? null,
        threadId: s.threadId ?? null,
        resourceId: s.resourceId ?? null,
        requestContext: s.requestContext ?? null,
        source: s.source ?? null,
        userId: s.userId ?? null,
        organizationId: s.organizationId ?? null,
        sessionId: s.sessionId ?? null,
        requestId: s.requestId ?? null,
        environment: s.environment ?? null,
        serviceName: s.serviceName ?? null,
        experimentId: s.experimentId ?? null,
      })
      .onConflictDoNothing({ target: aiSpans.id });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  private async updateSpanRow(db: Db, args: any) {
    const raw = args.span ?? args;
    // DefaultExporter sends { traceId, spanId, updates: {...} } — merge updates to top level
    const s = raw.updates ? { ...raw, ...raw.updates } : raw;
    const sets: Partial<typeof aiSpans.$inferInsert> = {};

    if (s.parentSpanId !== undefined) sets.parentSpanId = s.parentSpanId;
    if (s.name !== undefined) sets.name = s.name;
    if (s.scope !== undefined) sets.scope = s.scope;
    if (s.spanType !== undefined) sets.spanType = s.spanType;
    if (s.isEvent !== undefined) sets.isEvent = s.isEvent;
    if (s.startedAt !== undefined) sets.startedAt = s.startedAt;
    if (s.endedAt !== undefined) sets.endedAt = s.endedAt;
    if (s.attributes !== undefined) sets.attributes = s.attributes;
    if (s.metadata !== undefined) sets.metadata = s.metadata;
    if (s.links !== undefined) sets.links = s.links;
    if (s.input !== undefined) sets.input = s.input;
    if (s.output !== undefined) sets.output = s.output;
    if (s.error !== undefined) sets.error = s.error;
    if (s.tags !== undefined) sets.tags = s.tags;
    if (s.entityType !== undefined) sets.entityType = s.entityType;
    if (s.entityId !== undefined) sets.entityId = s.entityId;
    if (s.entityName !== undefined) sets.entityName = s.entityName;
    if (s.parentEntityType !== undefined) sets.parentEntityType = s.parentEntityType;
    if (s.parentEntityId !== undefined) sets.parentEntityId = s.parentEntityId;
    if (s.parentEntityName !== undefined) sets.parentEntityName = s.parentEntityName;
    if (s.rootEntityType !== undefined) sets.rootEntityType = s.rootEntityType;
    if (s.rootEntityId !== undefined) sets.rootEntityId = s.rootEntityId;
    if (s.rootEntityName !== undefined) sets.rootEntityName = s.rootEntityName;
    if (s.runId !== undefined) sets.runId = s.runId;
    if (s.threadId !== undefined) sets.threadId = s.threadId;
    if (s.resourceId !== undefined) sets.resourceId = s.resourceId;
    if (s.requestContext !== undefined) sets.requestContext = s.requestContext;
    if (s.source !== undefined) sets.source = s.source;
    if (s.userId !== undefined) sets.userId = s.userId;
    if (s.organizationId !== undefined) sets.organizationId = s.organizationId;
    if (s.sessionId !== undefined) sets.sessionId = s.sessionId;
    if (s.requestId !== undefined) sets.requestId = s.requestId;
    if (s.environment !== undefined) sets.environment = s.environment;
    if (s.serviceName !== undefined) sets.serviceName = s.serviceName;
    if (s.experimentId !== undefined) sets.experimentId = s.experimentId;
    sets.updatedAt = new Date();

    if (s.id) {
      await db.update(aiSpans).set(sets).where(eq(aiSpans.id, s.id));
    } else if (s.traceId && s.spanId) {
      await db
        .update(aiSpans)
        .set(sets)
        .where(and(eq(aiSpans.traceId, s.traceId), eq(aiSpans.spanId, s.spanId)));
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async getSpan(args: any): Promise<any> {
    if (args.id) {
      const [row] = await this.db.select().from(aiSpans).where(eq(aiSpans.id, args.id));
      return row ?? null;
    }
    const [row] = await this.db
      .select()
      .from(aiSpans)
      .where(and(eq(aiSpans.traceId, args.traceId), eq(aiSpans.spanId, args.spanId)));
    return row ?? null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async getRootSpan(args: any): Promise<any> {
    const [row] = await this.db
      .select()
      .from(aiSpans)
      .where(and(eq(aiSpans.traceId, args.traceId), isNull(aiSpans.parentSpanId)))
      .orderBy(asc(aiSpans.startedAt))
      .limit(1);
    return row ?? null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async getTrace(args: any): Promise<any> {
    const spans = await this.db
      .select()
      .from(aiSpans)
      .where(eq(aiSpans.traceId, args.traceId))
      .orderBy(asc(aiSpans.startedAt));
    if (spans.length === 0) return null;
    return { traceId: args.traceId, spans } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async listTraces(args: any): Promise<any> {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;

    const conditions = [];
    if (args?.filter?.name) conditions.push(eq(aiSpans.name, args.filter.name));
    if (args?.filter?.entityType) conditions.push(eq(aiSpans.entityType, args.filter.entityType));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const traceRows = await this.db
      .select({
        traceId: aiSpans.traceId,
        startedAt: sql<Date>`min(${aiSpans.startedAt})`.as('started_at'),
      })
      .from(aiSpans)
      .where(where)
      .groupBy(aiSpans.traceId)
      .orderBy(desc(sql`min(${aiSpans.startedAt})`))
      .limit(perPage)
      .offset(page * perPage);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(distinct ${aiSpans.traceId})::int` })
      .from(aiSpans)
      .where(where);
    const total = countRow?.count ?? 0;

    return { traces: traceRows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async batchCreateSpans(args: any) {
    const spans = args.records ?? args.spans ?? [];
    if (spans.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const span of spans) {
        await this.insertSpan(tx as unknown as Db, span);
      }
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async batchUpdateSpans(args: any) {
    const spans = args.records ?? args.spans ?? [];
    if (spans.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const span of spans) {
        await this.updateSpanRow(tx as unknown as Db, span);
      }
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async batchDeleteTraces(args: any) {
    const traceIds = args.traceIds ?? [];
    if (traceIds.length === 0) return;
    await this.db.delete(aiSpans).where(inArray(aiSpans.traceId, traceIds));
  }
}
