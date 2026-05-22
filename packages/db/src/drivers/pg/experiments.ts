import { ExperimentsStorage } from '@mastra/core/storage';
import { desc, eq, sql } from 'drizzle-orm';

import type { Db } from '../../client';
import { experimentResults, experiments } from '../../schema/experiments';

export class DrizzleExperimentsStorage extends ExperimentsStorage {
  constructor(private db: Db) {
    super();
  }

  async init() {}
  async dangerouslyClearAll() {
    await this.db.transaction(async (tx) => {
      await tx.delete(experimentResults);
      await tx.delete(experiments);
    });
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async createExperiment(input: any) {
    const id = input.id ?? crypto.randomUUID();
    const [row] = await this.db
      .insert(experiments)
      .values({
        id,
        name: input.name ?? null,
        description: input.description ?? null,
        metadata: input.metadata ?? null,
        datasetId: input.datasetId ?? null,
        datasetVersion: input.datasetVersion ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        status: input.status ?? 'pending',
        totalItems: input.totalItems ?? 0,
        succeededCount: 0,
        failedCount: 0,
        skippedCount: 0,
      })
      .returning();
    return row as never;
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async updateExperiment(input: any) {
    const { id, ...rest } = input;
    const sets: Partial<typeof experiments.$inferInsert> = {};
    if (rest.name !== undefined) sets.name = rest.name;
    if (rest.description !== undefined) sets.description = rest.description;
    if (rest.metadata !== undefined) sets.metadata = rest.metadata;
    if (rest.datasetId !== undefined) sets.datasetId = rest.datasetId;
    if (rest.datasetVersion !== undefined) sets.datasetVersion = rest.datasetVersion;
    if (rest.targetType !== undefined) sets.targetType = rest.targetType;
    if (rest.targetId !== undefined) sets.targetId = rest.targetId;
    if (rest.status !== undefined) sets.status = rest.status;
    if (rest.totalItems !== undefined) sets.totalItems = rest.totalItems;
    if (rest.succeededCount !== undefined) sets.succeededCount = rest.succeededCount;
    if (rest.failedCount !== undefined) sets.failedCount = rest.failedCount;
    if (rest.skippedCount !== undefined) sets.skippedCount = rest.skippedCount;
    if (rest.startedAt !== undefined) sets.startedAt = rest.startedAt;
    if (rest.completedAt !== undefined) sets.completedAt = rest.completedAt;

    const [row] = await this.db.update(experiments).set(sets).where(eq(experiments.id, id)).returning();
    return row as never;
  }

  async getExperimentById(args: { id: string }) {
    const [row] = await this.db.select().from(experiments).where(eq(experiments.id, args.id));
    return (row as never) ?? null;
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async listExperiments(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;
    const status = args?.status as string | undefined;
    const validStatuses = ['pending', 'running', 'completed', 'failed'];
    const where = status && validStatuses.includes(status) ? eq(experiments.status, status as never) : undefined;

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(experiments)
      .where(where);
    const total = countRow?.count ?? 0;

    const rows = await this.db
      .select()
      .from(experiments)
      .where(where)
      .orderBy(desc(experiments.createdAt))
      .limit(perPage)
      .offset(page * perPage);

    return { experiments: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  async deleteExperiment(args: { id: string }) {
    await this.db.transaction(async (tx) => {
      await tx.delete(experimentResults).where(eq(experimentResults.experimentId, args.id));
      await tx.delete(experiments).where(eq(experiments.id, args.id));
    });
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async addExperimentResult(input: any) {
    const id = input.id ?? crypto.randomUUID();
    const [row] = await this.db
      .insert(experimentResults)
      .values({
        id,
        experimentId: input.experimentId,
        itemId: input.itemId,
        itemDatasetVersion: input.itemDatasetVersion ?? null,
        input: input.input,
        output: input.output ?? null,
        groundTruth: input.groundTruth ?? null,
        error: input.error ?? null,
        startedAt: input.startedAt ?? new Date(),
        completedAt: input.completedAt ?? new Date(),
        retryCount: input.retryCount ?? 0,
        traceId: input.traceId ?? null,
      })
      .returning();
    return row as never;
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async updateExperimentResult(input: any) {
    const { id, ...rest } = input;
    const sets: Partial<typeof experimentResults.$inferInsert> = {};
    if (rest.experimentId !== undefined) sets.experimentId = rest.experimentId;
    if (rest.itemId !== undefined) sets.itemId = rest.itemId;
    if (rest.itemDatasetVersion !== undefined) sets.itemDatasetVersion = rest.itemDatasetVersion;
    if (rest.input !== undefined) sets.input = rest.input;
    if (rest.output !== undefined) sets.output = rest.output;
    if (rest.groundTruth !== undefined) sets.groundTruth = rest.groundTruth;
    if (rest.error !== undefined) sets.error = rest.error;
    if (rest.startedAt !== undefined) sets.startedAt = rest.startedAt;
    if (rest.completedAt !== undefined) sets.completedAt = rest.completedAt;
    if (rest.retryCount !== undefined) sets.retryCount = rest.retryCount;
    if (rest.traceId !== undefined) sets.traceId = rest.traceId;

    const [row] = await this.db.update(experimentResults).set(sets).where(eq(experimentResults.id, id)).returning();
    return row as never;
  }

  async getExperimentResultById(args: { id: string }) {
    const [row] = await this.db.select().from(experimentResults).where(eq(experimentResults.id, args.id));
    return (row as never) ?? null;
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async listExperimentResults(args: any) {
    const page = args?.page ?? 0;
    const perPage = args?.perPage ?? 100;

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(experimentResults)
      .where(eq(experimentResults.experimentId, args.experimentId));
    const total = countRow?.count ?? 0;

    const rows = await this.db
      .select()
      .from(experimentResults)
      .where(eq(experimentResults.experimentId, args.experimentId))
      .orderBy(desc(experimentResults.createdAt))
      .limit(perPage)
      .offset(page * perPage);

    return { results: rows, total, page, perPage, hasMore: (page + 1) * perPage < total } as never;
  }

  async deleteExperimentResults(args: { experimentId: string }) {
    await this.db.delete(experimentResults).where(eq(experimentResults.experimentId, args.experimentId));
  }

  async getReviewSummary() {
    const rows = await this.db
      .select({
        experimentId: experimentResults.experimentId,
        total: sql<number>`count(*)::int`,
      })
      .from(experimentResults)
      .groupBy(experimentResults.experimentId);
    return rows as never;
  }
}
