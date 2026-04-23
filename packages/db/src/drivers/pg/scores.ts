import { ScoresStorage } from '@mastra/core/storage';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../client';
import { scores } from '../../schema/scores';

export class DrizzleScoresStorage extends ScoresStorage {
  constructor(private db: Db) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.db.delete(scores);
  }

  async getScoreById(args: { id: string }) {
    const [row] = await this.db.select().from(scores).where(eq(scores.id, args.id));
    return (row as never) ?? null;
  }

  async saveScore(score: Record<string, unknown>) {
    const id = (score.id as string) ?? crypto.randomUUID();
    const values = this.mapToInsert(score, id);
    const [row] = await this.db
      .insert(scores)
      .values(values)
      .onConflictDoUpdate({ target: scores.id, set: values })
      .returning();
    return { score: row } as never;
  }

  async listScoresByScorerId(args: {
    scorerId: string;
    pagination: { page: number; perPage: number };
    entityId?: string;
    entityType?: string;
  }) {
    return this.listScores(eq(scores.scorerId, args.scorerId), args.pagination);
  }

  async listScoresByRunId(args: { runId: string; pagination: { page: number; perPage: number } }) {
    return this.listScores(eq(scores.runId, args.runId), args.pagination);
  }

  async listScoresByEntityId(args: {
    entityId: string;
    entityType: string;
    pagination: { page: number; perPage: number };
  }) {
    return this.listScores(
      and(eq(scores.entityId, args.entityId), eq(scores.entityType, args.entityType))!,
      args.pagination,
    );
  }

  private async listScores(where: ReturnType<typeof eq>, pagination: { page: number; perPage: number }) {
    const [countRow] = await this.db.select({ count: sql<number>`count(*)::int` }).from(scores).where(where);
    const total = countRow?.count ?? 0;
    const offset = pagination.page * pagination.perPage;

    const rows = await this.db
      .select()
      .from(scores)
      .where(where)
      .orderBy(desc(scores.createdAt))
      .limit(pagination.perPage)
      .offset(offset);

    return {
      scores: rows as never[],
      total,
      page: pagination.page,
      perPage: pagination.perPage,
      hasMore: (pagination.page + 1) * pagination.perPage < total,
    } as never;
  }

  private mapToInsert(score: Record<string, unknown>, id: string): typeof scores.$inferInsert {
    return {
      id,
      scorerId: score.scorerId as string,
      traceId: score.traceId as string,
      spanId: score.spanId as string,
      runId: score.runId as string,
      scorer: score.scorer as Record<string, unknown>,
      preprocessStepResult: score.preprocessStepResult as Record<string, unknown>,
      extractStepResult: score.extractStepResult as Record<string, unknown>,
      analyzeStepResult: score.analyzeStepResult as Record<string, unknown>,
      score: score.score as number,
      reason: score.reason as string,
      metadata: score.metadata as Record<string, unknown>,
      preprocessPrompt: score.preprocessPrompt as string,
      extractPrompt: score.extractPrompt as string,
      generateScorePrompt: score.generateScorePrompt as string,
      generateReasonPrompt: score.generateReasonPrompt as string,
      analyzePrompt: score.analyzePrompt as string,
      reasonPrompt: score.reasonPrompt as string,
      input: score.input,
      output: score.output,
      additionalContext: score.additionalContext as Record<string, unknown>,
      requestContext: score.requestContext as Record<string, unknown>,
      entityType: score.entityType as string,
      entity: score.entity as Record<string, unknown>,
      entityId: score.entityId as string,
      source: score.source as string,
      resourceId: score.resourceId as string,
      threadId: score.threadId as string,
      structuredOutput: score.structuredOutput as string,
    };
  }
}
