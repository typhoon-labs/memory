import { ObservabilityStorage } from '@mastra/core/storage';
import type { Sql } from 'postgres';
import { AI_SPAN_COLUMNS, validateColumn } from './validate-columns.js';

/**
 * Observability storage using raw SQL for ai_spans table.
 * The ObservabilityStorage base class has non-abstract default implementations
 * that throw "not implemented". We override the core span operations.
 */
export class DrizzleObservabilityStorage extends ObservabilityStorage {
  constructor(private sql: Sql) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.sql.unsafe(`DELETE FROM "ai_spans"`);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async createSpan(args: any) {
    await this.createSpanWith(this.sql, args);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async updateSpan(args: any) {
    await this.updateSpanWith(this.sql, args);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  private async createSpanWith(conn: { unsafe: Sql['unsafe'] }, args: any) {
    const s = args.span ?? args;
    await conn.unsafe(
      `INSERT INTO "ai_spans" (id, trace_id, span_id, parent_span_id, name, scope, span_type, is_event, started_at, ended_at, attributes, metadata, links, input, output, error, tags, entity_type, entity_id, entity_name, parent_entity_type, parent_entity_id, parent_entity_name, root_entity_type, root_entity_id, root_entity_name, run_id, thread_id, resource_id, request_context, source, user_id, organization_id, session_id, request_id, environment, service_name, experiment_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
       ON CONFLICT (id) DO NOTHING`,
      [
        s.id ?? crypto.randomUUID(),
        s.traceId,
        s.spanId,
        s.parentSpanId ?? null,
        s.name,
        j(s.scope),
        s.spanType,
        s.isEvent ?? false,
        s.startedAt,
        s.endedAt ?? null,
        j(s.attributes),
        j(s.metadata),
        j(s.links),
        j(s.input),
        j(s.output),
        j(s.error),
        j(s.tags),
        s.entityType ?? null,
        s.entityId ?? null,
        s.entityName ?? null,
        s.parentEntityType ?? null,
        s.parentEntityId ?? null,
        s.parentEntityName ?? null,
        s.rootEntityType ?? null,
        s.rootEntityId ?? null,
        s.rootEntityName ?? null,
        s.runId ?? null,
        s.threadId ?? null,
        s.resourceId ?? null,
        j(s.requestContext),
        s.source ?? null,
        s.userId ?? null,
        s.organizationId ?? null,
        s.sessionId ?? null,
        s.requestId ?? null,
        s.environment ?? null,
        s.serviceName ?? null,
        s.experimentId ?? null,
        new Date(),
        new Date(),
      ] as (string | number | boolean | null)[],
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  private async updateSpanWith(conn: { unsafe: Sql['unsafe'] }, args: any) {
    const s = args.span ?? args;
    const sets: string[] = ['updated_at = NOW()'];
    const vals: (string | number | boolean | null)[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(s)) {
      if (key === 'id' || key === 'traceId' || key === 'spanId') continue;
      if (value === undefined) continue;
      const col = validateColumn(
        key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
        AI_SPAN_COLUMNS,
      );
      const val =
        typeof value === 'object' && value !== null && !(value instanceof Date) ? JSON.stringify(value) : value;
      sets.push(`"${col}" = $${idx}`);
      vals.push((val ?? null) as string | number | boolean | null);
      idx++;
    }

    if (s.id) {
      vals.push(s.id);
      await conn.unsafe(`UPDATE "ai_spans" SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    } else if (s.traceId && s.spanId) {
      vals.push(s.traceId, s.spanId);
      await conn.unsafe(
        `UPDATE "ai_spans" SET ${sets.join(', ')} WHERE trace_id = $${idx} AND span_id = $${idx + 1}`,
        vals,
      );
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async getSpan(args: any): Promise<any> {
    const [row] = args.id
      ? await this.sql.unsafe(`SELECT * FROM "ai_spans" WHERE id = $1`, [args.id])
      : await this.sql.unsafe(`SELECT * FROM "ai_spans" WHERE trace_id = $1 AND span_id = $2`, [
          args.traceId,
          args.spanId,
        ]);
    return row ?? null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async getRootSpan(args: any): Promise<any> {
    const [row] = await this.sql.unsafe(
      `SELECT * FROM "ai_spans" WHERE trace_id = $1 AND parent_span_id IS NULL ORDER BY started_at ASC LIMIT 1`,
      [args.traceId],
    );
    return row ?? null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async getTrace(args: any): Promise<any> {
    const spans = await this.sql.unsafe(`SELECT * FROM "ai_spans" WHERE trace_id = $1 ORDER BY started_at ASC`, [
      args.traceId,
    ]);
    if (spans.length === 0) return null;
    return { traceId: args.traceId, spans } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async listTraces(args: any): Promise<any> {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;

    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (args?.filter?.name) {
      params.push(args.filter.name);
      conditions.push(`name = $${params.length}`);
    }
    if (args?.filter?.entityType) {
      params.push(args.filter.entityType);
      conditions.push(`entity_type = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get distinct trace IDs
    const traceRows = await this.sql.unsafe(
      `SELECT DISTINCT trace_id, MIN(started_at) AS started_at FROM "ai_spans" ${where} GROUP BY trace_id ORDER BY started_at DESC LIMIT ${perPage} OFFSET ${page * perPage}`,
      params,
    );

    const [countRow] = await this.sql.unsafe(
      `SELECT COUNT(DISTINCT trace_id)::int AS count FROM "ai_spans" ${where}`,
      params,
    );
    const total = (countRow as Record<string, number>)?.count ?? 0;

    return { traces: traceRows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async batchCreateSpans(args: any) {
    const spans = args.spans ?? [];
    if (spans.length === 0) return;
    await this.sql.begin(async (tx) => {
      for (const span of spans) {
        await this.createSpanWith(tx, span);
      }
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra span types
  override async batchUpdateSpans(args: any) {
    const spans = args.spans ?? [];
    if (spans.length === 0) return;
    await this.sql.begin(async (tx) => {
      for (const span of spans) {
        await this.updateSpanWith(tx, span);
      }
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  override async batchDeleteTraces(args: any) {
    const traceIds = args.traceIds ?? [];
    if (traceIds.length === 0) return;
    const placeholders = traceIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
    await this.sql.unsafe(`DELETE FROM "ai_spans" WHERE trace_id IN (${placeholders})`, traceIds as string[]);
  }
}

function j(v: unknown): string | null {
  return v != null ? JSON.stringify(v) : null;
}
