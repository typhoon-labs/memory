import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '../client';
import { user } from '../schema/auth';
import { messages } from '../schema/messages';
import { scores } from '../schema/scores';
import { threads } from '../schema/threads';

/** Raw thread row with message count from the list query. */
export interface ThreadWithMessageCount {
  id: string;
  resource_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/** Aggregated scores for a thread. */
export interface ThreadScoreAggregate {
  thread_id: string;
  response_avg: number | null;
  retrieval_avg: number | null;
  score_count: number;
  annotation_count: number;
}

/** Feedback count row. */
export interface ThreadFeedbackCount {
  thread_id: string;
  feedback_count: number;
  negative_feedback_count: number;
}

/** Feedback row for thread detail. */
export interface FeedbackRow {
  rating: string;
  comment: string | null;
  created_at: string;
  user_name: string;
  message_external_id: string;
}

export class ReviewRepo {
  constructor(private db: Db) {}

  /** Fetch all threads with message counts, ordered by updated_at DESC. */
  async listThreadsWithMessageCounts(): Promise<ThreadWithMessageCount[]> {
    const rows = await this.db.execute(sql`
      SELECT
        t."external_id"  AS id,
        t."resource_id",
        t."title",
        t."created_at",
        t."updated_at",
        COUNT(m.id)::int AS message_count
      FROM "threads" t
      LEFT JOIN "messages" m ON m."thread_id" = t."id"
      GROUP BY t."id"
      ORDER BY t."updated_at" DESC
    `);
    return rows as unknown as ThreadWithMessageCount[];
  }

  /** Batch-fetch score aggregates for the given thread external IDs. */
  async getScoreAggregates(threadIds: string[]): Promise<ThreadScoreAggregate[]> {
    if (threadIds.length === 0) return [];
    const rows = await this.db.execute(
      sql`SELECT
        "thread_id",
        AVG(CASE
          WHEN "scorer_id" IN ('answerRelevancy', 'faithfulness') THEN "score"
          WHEN "scorer_id" = 'hallucination' THEN 1 - "score"
        END)::real AS response_avg,
        AVG(CASE
          WHEN "scorer_id" IN ('contextRelevance', 'contextPrecision') THEN "score"
        END)::real AS retrieval_avg,
        COUNT(*) FILTER (WHERE "scorer_id" != 'human-review')::int AS score_count,
        COUNT(*) FILTER (WHERE "scorer_id" = 'human-review')::int AS annotation_count
      FROM "scores"
      WHERE ${inArray(scores.threadId, threadIds)} AND "entity_type" = 'message'
      GROUP BY "thread_id"`,
    );
    return rows as unknown as ThreadScoreAggregate[];
  }

  /** Batch-fetch feedback counts for the given thread external IDs. */
  async getFeedbackCounts(threadIds: string[]): Promise<ThreadFeedbackCount[]> {
    if (threadIds.length === 0) return [];
    const rows = await this.db.execute(
      sql`SELECT
        t."external_id" AS thread_id,
        COUNT(*)::int AS feedback_count,
        COUNT(*) FILTER (WHERE f."rating" = 'negative')::int AS negative_feedback_count
      FROM "feedback" f
      JOIN "threads" t ON f."thread_id" = t."id"
      WHERE t."external_id" IN (${sql.join(
        threadIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      GROUP BY t."external_id"`,
    );
    return rows as unknown as ThreadFeedbackCount[];
  }

  /** Find a full thread row by external ID. */
  async findThreadByExternalId(externalId: string) {
    const [thread] = await this.db.select().from(threads).where(eq(threads.externalId, externalId));
    return thread ?? null;
  }

  /** List messages for a thread ordered by creation time. */
  async listMessagesByThreadId(threadId: string) {
    return this.db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(asc(messages.createdAt));
  }

  /** Get all scores for a thread (by external ID). */
  async getThreadScores(threadId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.execute(
      sql`SELECT * FROM "scores" WHERE "thread_id" = ${threadId} AND "entity_type" = 'message' ORDER BY "created_at" ASC`,
    );
    return rows as unknown as Array<Record<string, unknown>>;
  }

  /** Look up user names by IDs. */
  async getAnnotatorNames(annotatorIds: string[]): Promise<Map<string, string>> {
    if (annotatorIds.length === 0) return new Map();
    const users = (await this.db.execute(
      sql`SELECT id, name FROM "user" WHERE ${inArray(user.id, annotatorIds)}`,
    )) as unknown as Array<{
      id: string;
      name: string;
    }>;
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /** Get feedback for a thread (by internal ID). */
  async getThreadFeedback(internalThreadId: string): Promise<FeedbackRow[]> {
    const rows = await this.db.execute(
      sql`SELECT f.rating, f.comment, f.created_at, u.name AS user_name, m.external_id AS message_external_id
       FROM "feedback" f
       JOIN "messages" m ON f.message_id = m.id
       JOIN "user" u ON f.user_id = u.id
       WHERE f.thread_id = ${internalThreadId}`,
    );
    return rows as unknown as FeedbackRow[];
  }

  /** Verify a message exists in a given thread. */
  async findMessageInThread(messageExternalId: string, threadInternalId: string) {
    const [msg] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.externalId, messageExternalId), eq(messages.threadId, threadInternalId)));
    return msg ?? null;
  }

  /** Find an existing annotation by user for a given message. */
  async findAnnotation(messageId: string, userId: string): Promise<{ id: string } | null> {
    const rows = await this.db.execute(
      sql`SELECT id FROM "scores"
       WHERE "entity_id" = ${messageId}
         AND "entity_type" = 'message'
         AND "scorer_id" = 'human-review'
         AND "metadata"->>'annotatorId' = ${userId}
       LIMIT 1`,
    );
    const existing = (rows as unknown as Array<{ id: string }>)[0];
    return existing ?? null;
  }

  /** Insert a new human-review score. */
  async createAnnotation(data: {
    id: string;
    messageId: string;
    threadId: string;
    score: number;
    comment: string;
    metadata: Record<string, unknown>;
    resourceId: string;
  }): Promise<void> {
    await this.db.execute(
      sql`INSERT INTO "scores" (id, scorer_id, entity_type, entity_id, thread_id, score, reason, metadata, resource_id, created_at, updated_at)
       VALUES (${data.id}, 'human-review', 'message', ${data.messageId}, ${data.threadId}, ${data.score}, ${data.comment}, ${JSON.stringify(data.metadata)}, ${data.resourceId}, NOW(), NOW())`,
    );
  }

  /** Update an existing annotation. */
  async updateAnnotation(
    id: string,
    data: { score: number; comment: string; metadata: Record<string, unknown> },
  ): Promise<void> {
    await this.db.execute(
      sql`UPDATE "scores"
       SET score = ${data.score}, reason = ${data.comment}, metadata = ${JSON.stringify(data.metadata)}, updated_at = NOW()
       WHERE id = ${id}`,
    );
  }

  /** Delete an annotation by ID. */
  async deleteAnnotation(id: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM "scores" WHERE id = ${id}`);
  }
}
