import { WorkflowsStorage } from '@mastra/core/storage';
import type { Db } from '@typhoon/db';
import { workflowSnapshots } from '@typhoon/db';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

export class DrizzleWorkflowsStorage extends WorkflowsStorage {
  constructor(private db: Db) {
    super();
  }

  supportsConcurrentUpdates() {
    return false;
  }

  async init() {}

  async dangerouslyClearAll() {
    await this.db.delete(workflowSnapshots);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra WorkflowRunState type
  async persistWorkflowSnapshot(args: any) {
    await this.db
      .insert(workflowSnapshots)
      .values({
        workflowName: args.workflowName,
        runId: args.runId,
        resourceId: args.resourceId ?? null,
        snapshot: args.snapshot,
        createdAt: args.createdAt ?? new Date(),
        updatedAt: args.updatedAt ?? new Date(),
      })
      .onConflictDoUpdate({
        target: [workflowSnapshots.workflowName, workflowSnapshots.runId],
        set: {
          snapshot: args.snapshot,
          resourceId: args.resourceId ?? null,
          updatedAt: new Date(),
        },
      });
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra WorkflowRunState type
  async loadWorkflowSnapshot(args: { workflowName: string; runId: string }): Promise<any> {
    const [row] = await this.db
      .select()
      .from(workflowSnapshots)
      .where(and(eq(workflowSnapshots.workflowName, args.workflowName), eq(workflowSnapshots.runId, args.runId)));
    return row?.snapshot ?? null;
  }

  async getWorkflowRunById(args: { runId: string; workflowName?: string }) {
    const conditions = [eq(workflowSnapshots.runId, args.runId)];
    if (args.workflowName) conditions.push(eq(workflowSnapshots.workflowName, args.workflowName));
    const [row] = await this.db
      .select()
      .from(workflowSnapshots)
      .where(and(...conditions));
    if (!row) return null;
    return {
      workflowName: row.workflowName,
      runId: row.runId,
      snapshot: row.snapshot as Record<string, unknown>,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resourceId: row.resourceId ?? undefined,
    } as never;
  }

  async deleteWorkflowRunById(args: { runId: string; workflowName: string }) {
    await this.db
      .delete(workflowSnapshots)
      .where(and(eq(workflowSnapshots.runId, args.runId), eq(workflowSnapshots.workflowName, args.workflowName)));
  }

  async listWorkflowRuns(args?: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    perPage?: number | false;
    page?: number;
    resourceId?: string;
    status?: string;
  }) {
    const conditions = [];
    if (args?.workflowName) conditions.push(eq(workflowSnapshots.workflowName, args.workflowName));
    if (args?.fromDate) conditions.push(gte(workflowSnapshots.createdAt, args.fromDate));
    if (args?.toDate) conditions.push(lte(workflowSnapshots.createdAt, args.toDate));
    if (args?.resourceId) conditions.push(eq(workflowSnapshots.resourceId, args.resourceId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = args?.page ?? 0;
    const perPage = args?.perPage;

    const [countRow] = await this.db.select({ count: sql<number>`count(*)::int` }).from(workflowSnapshots).where(where);
    const total = countRow?.count ?? 0;

    let query = this.db
      .select()
      .from(workflowSnapshots)
      .where(where)
      .orderBy(desc(workflowSnapshots.createdAt))
      .$dynamic();
    if (typeof perPage === 'number') {
      query = query.limit(perPage).offset(page * perPage);
    }
    const rows = await query;

    return {
      runs: rows.map((row) => ({
        workflowName: row.workflowName,
        runId: row.runId,
        snapshot: row.snapshot as Record<string, unknown>,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        resourceId: row.resourceId ?? undefined,
      })),
      total,
    } as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra UpdateWorkflowStateOptions type
  async updateWorkflowState(args: any) {
    const existing = await this.loadWorkflowSnapshot({ workflowName: args.workflowName, runId: args.runId });
    if (!existing) return undefined;
    const updated = { ...existing, ...args.opts };
    await this.persistWorkflowSnapshot({
      workflowName: args.workflowName,
      runId: args.runId,
      snapshot: updated,
    });
    return updated as never;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra StepResult type
  async updateWorkflowResults(args: any) {
    const existing = await this.loadWorkflowSnapshot({ workflowName: args.workflowName, runId: args.runId });
    if (!existing) return {} as never;
    const results = ((existing as Record<string, unknown>).stepResults as Record<string, unknown>) ?? {};
    results[args.stepId] = args.result;
    (existing as Record<string, unknown>).stepResults = results;
    await this.persistWorkflowSnapshot({
      workflowName: args.workflowName,
      runId: args.runId,
      snapshot: existing,
    });
    return results as never;
  }
}
