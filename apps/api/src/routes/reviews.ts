import { registerApiRoute } from '@mastra/core/server';
import { messages, threads } from '@typhoon/db';
import { PgVector } from '@typhoon/db/drivers/pg';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, sql } from '../db';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { hydrateChunkSources } from './hydrate-chunks';
import { isSystemReminder, toThreadResponse, toUIMessage } from './threads';

const vectorStore = new PgVector({ id: 'typhoon-vectors', sql });

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

const annotationSchema = z.object({
  tags: z
    .array(z.enum(['wrong-answer', 'hallucination', 'incomplete', 'wrong-source-cited', 'tone-issue', 'correct']))
    .min(1),
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  comment: z.string().optional(),
});

export const reviewRoutes = [
  // List all threads with aggregate score data (admin view — no user filter)
  registerApiRoute('/v1/admin/reviews', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const sortBy = c.req.query('sortBy') ?? 'newest';
      const annotationStatus = c.req.query('annotationStatus') ?? 'all';

      // Step 1: Fetch all threads with message counts
      const allThreads = (await sql.unsafe(`
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
      `)) as Array<{
        id: string;
        resource_id: string;
        title: string;
        created_at: string;
        updated_at: string;
        message_count: number;
      }>;

      // Step 2: Batch-fetch score aggregates
      const threadIds = allThreads.map((t) => t.id);
      let aggregates = new Map<
        string,
        { responseAvg: number | null; retrievalAvg: number | null; scoreCount: number; annotationCount: number }
      >();

      if (threadIds.length > 0) {
        const rows = (await sql.unsafe(
          `SELECT
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
          WHERE "thread_id" = ANY($1) AND "entity_type" = 'message'
          GROUP BY "thread_id"`,
          [threadIds],
        )) as Array<{
          thread_id: string;
          response_avg: number | null;
          retrieval_avg: number | null;
          score_count: number;
          annotation_count: number;
        }>;

        aggregates = new Map(
          rows.map((r) => [
            r.thread_id,
            {
              responseAvg: r.response_avg,
              retrievalAvg: r.retrieval_avg,
              scoreCount: r.score_count,
              annotationCount: r.annotation_count,
            },
          ]),
        );
      }

      // Step 2b: Batch-fetch feedback counts
      let feedbackCounts = new Map<string, { feedbackCount: number; negativeFeedbackCount: number }>();
      if (threadIds.length > 0) {
        // feedback.thread_id references threads.id (internal), so we join to filter by external_id
        const externalIds = allThreads.map((t) => t.id);
        const fbRows = (await sql.unsafe(
          `SELECT
            t."external_id" AS thread_id,
            COUNT(*)::int AS feedback_count,
            COUNT(*) FILTER (WHERE f."rating" = 'negative')::int AS negative_feedback_count
          FROM "feedback" f
          JOIN "threads" t ON f."thread_id" = t."id"
          WHERE t."external_id" = ANY($1)
          GROUP BY t."external_id"`,
          [externalIds],
        )) as Array<{
          thread_id: string;
          feedback_count: number;
          negative_feedback_count: number;
        }>;
        feedbackCounts = new Map(
          fbRows.map((r) => [
            r.thread_id,
            { feedbackCount: r.feedback_count, negativeFeedbackCount: r.negative_feedback_count },
          ]),
        );
      }

      // Step 3: Merge, filter, sort, paginate
      const fbDefaults = { feedbackCount: 0, negativeFeedbackCount: 0 };
      const defaults = { responseAvg: null, retrievalAvg: null, scoreCount: 0, annotationCount: 0 };
      let merged = allThreads.map((t) => ({
        ...t,
        ...(aggregates.get(t.id) ?? defaults),
        ...(feedbackCounts.get(t.id) ?? fbDefaults),
      }));

      if (annotationStatus === 'annotated') {
        merged = merged.filter((t) => t.annotationCount > 0);
      } else if (annotationStatus === 'unannotated') {
        merged = merged.filter((t) => t.annotationCount === 0);
      }

      if (sortBy === 'responseScore') {
        merged.sort((a, b) => {
          if (a.responseAvg === null && b.responseAvg === null) return 0;
          if (a.responseAvg === null) return 1;
          if (b.responseAvg === null) return -1;
          return a.responseAvg - b.responseAvg;
        });
      } else if (sortBy === 'retrievalScore') {
        merged.sort((a, b) => {
          if (a.retrievalAvg === null && b.retrievalAvg === null) return 0;
          if (a.retrievalAvg === null) return 1;
          if (b.retrievalAvg === null) return -1;
          return a.retrievalAvg - b.retrievalAvg;
        });
      } else if (sortBy === 'unscored') {
        merged.sort((a, b) => a.scoreCount - b.scoreCount);
      }
      // 'newest' preserves SQL ORDER BY (updated_at DESC)

      return c.json({ threads: merged, total: merged.length });
    },
  }),

  // Thread detail with messages + all scores grouped by message
  registerApiRoute('/v1/admin/reviews/:threadId', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const threadId = c.req.param('threadId');

      const [thread] = await db.select().from(threads).where(eq(threads.externalId, threadId));

      if (!thread) return c.json({ error: 'Not found' }, 404);

      const threadMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.threadId, thread.id))
        .orderBy(asc(messages.createdAt));

      const uiMessages = threadMessages.filter((msg) => !isSystemReminder(msg)).map(toUIMessage);
      await hydrateChunkSources(uiMessages, vectorStore);

      // Fetch all scores for this thread
      const allScores = (await sql.unsafe(
        `SELECT * FROM "scores" WHERE "thread_id" = $1 AND "entity_type" = 'message' ORDER BY "created_at" ASC`,
        [threadId],
      )) as Array<Record<string, unknown>>;

      // Resolve annotator names for human-review scores
      const annotatorIds = [
        ...new Set(
          allScores
            .filter((s) => s.scorer_id === 'human-review')
            .map((s) => (s.metadata as Record<string, unknown> | null)?.annotatorId as string | undefined)
            .filter(Boolean),
        ),
      ] as string[];

      let annotatorNames = new Map<string, string>();
      if (annotatorIds.length > 0) {
        const users = (await sql.unsafe(`SELECT id, name FROM "user" WHERE id = ANY($1)`, [annotatorIds])) as Array<{
          id: string;
          name: string;
        }>;
        annotatorNames = new Map(users.map((u) => [u.id, u.name]));
      }

      // Group by entity_id (message externalId) and enrich human-review with annotator names
      const scoresByMessage: Record<string, Array<Record<string, unknown>>> = {};
      for (const score of allScores) {
        const key = score.entity_id as string;
        if (!scoresByMessage[key]) scoresByMessage[key] = [];
        if (score.scorer_id === 'human-review') {
          const meta = score.metadata as Record<string, unknown> | null;
          const annotatorId = meta?.annotatorId as string | undefined;
          if (annotatorId && annotatorNames.has(annotatorId)) {
            score.metadata = { ...meta, annotatorName: annotatorNames.get(annotatorId) };
          }
        }
        scoresByMessage[key].push(score);
      }

      // Fetch user feedback for this thread
      const feedbackRows = (await sql.unsafe(
        `SELECT f.rating, f.comment, f.created_at, u.name AS user_name, m.external_id AS message_external_id
         FROM "feedback" f
         JOIN "messages" m ON f.message_id = m.id
         JOIN "user" u ON f.user_id = u.id
         WHERE f.thread_id = $1`,
        [thread.id],
      )) as Array<{
        rating: string;
        comment: string | null;
        created_at: string;
        user_name: string;
        message_external_id: string;
      }>;

      const feedbackByMessage: Record<
        string,
        Array<{ rating: string; comment: string | null; userName: string; createdAt: string }>
      > = {};
      for (const row of feedbackRows) {
        const key = row.message_external_id;
        if (!feedbackByMessage[key]) feedbackByMessage[key] = [];
        feedbackByMessage[key].push({
          rating: row.rating,
          comment: row.comment,
          userName: row.user_name,
          createdAt: row.created_at,
        });
      }

      return c.json({
        ...toThreadResponse(thread),
        messages: uiMessages,
        scoresByMessage,
        feedbackByMessage,
      });
    },
  }),

  // Create human annotation on a message
  registerApiRoute('/v1/admin/reviews/:threadId/messages/:messageId/annotate', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const threadId = c.req.param('threadId');
      const messageId = c.req.param('messageId');
      const userId = getUserId(c);
      const body = annotationSchema.parse(await c.req.json());

      // Verify thread exists
      const [thread] = await db.select({ id: threads.id }).from(threads).where(eq(threads.externalId, threadId));
      if (!thread) return c.json({ error: 'Thread not found' }, 404);

      // Verify message exists in this thread
      const [msg] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.externalId, messageId), eq(messages.threadId, thread.id)));
      if (!msg) return c.json({ error: 'Message not found' }, 404);

      // Check for existing annotation by this user
      const [existing] = await sql.unsafe(
        `SELECT id FROM "scores"
         WHERE "entity_id" = $1
           AND "entity_type" = 'message'
           AND "scorer_id" = 'human-review'
           AND "metadata"->>'annotatorId' = $2
         LIMIT 1`,
        [messageId, userId],
      );
      if (existing) {
        return c.json({ error: 'Annotation already exists. Use PATCH to update.' }, 409);
      }

      const isCorrect = body.tags.includes('correct');
      const id = crypto.randomUUID();

      await sql.unsafe(
        `INSERT INTO "scores" (id, scorer_id, entity_type, entity_id, thread_id, score, reason, metadata, resource_id, created_at, updated_at)
         VALUES ($1, 'human-review', 'message', $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          id,
          messageId,
          threadId,
          isCorrect ? 1.0 : 0.0,
          body.comment ?? '',
          JSON.stringify({ source: 'human', tags: body.tags, severity: body.severity ?? null, annotatorId: userId }),
          userId,
        ],
      );

      return c.json({ id, scorerId: 'human-review', entityId: messageId, threadId }, 201);
    },
  }),

  // Update existing annotation
  registerApiRoute('/v1/admin/reviews/:threadId/messages/:messageId/annotate', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const messageId = c.req.param('messageId');
      const userId = getUserId(c);
      const body = annotationSchema.parse(await c.req.json());

      // Find existing annotation by this user
      const [existing] = (await sql.unsafe(
        `SELECT id FROM "scores"
         WHERE "entity_id" = $1
           AND "entity_type" = 'message'
           AND "scorer_id" = 'human-review'
           AND "metadata"->>'annotatorId' = $2
         LIMIT 1`,
        [messageId, userId],
      )) as Array<{ id: string }>;
      if (!existing) return c.json({ error: 'No annotation found to update' }, 404);

      const isCorrect = body.tags.includes('correct');

      await sql.unsafe(
        `UPDATE "scores"
         SET score = $1, reason = $2, metadata = $3, updated_at = NOW()
         WHERE id = $4`,
        [
          isCorrect ? 1.0 : 0.0,
          body.comment ?? '',
          JSON.stringify({ source: 'human', tags: body.tags, severity: body.severity ?? null, annotatorId: userId }),
          existing.id,
        ],
      );

      return c.json({ id: existing.id, updated: true });
    },
  }),

  // Delete annotation
  registerApiRoute('/v1/admin/reviews/:threadId/messages/:messageId/annotate', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const messageId = c.req.param('messageId') as string;
      const userId = getUserId(c);

      const [existing] = (await sql.unsafe(
        `SELECT id FROM "scores"
         WHERE "entity_id" = $1
           AND "entity_type" = 'message'
           AND "scorer_id" = 'human-review'
           AND "metadata"->>'annotatorId' = $2
         LIMIT 1`,
        [messageId, userId],
      )) as Array<{ id: string }>;
      if (!existing) return c.json({ error: 'No annotation found' }, 404);

      await sql.unsafe(`DELETE FROM "scores" WHERE id = $1`, [existing.id]);

      return c.json({ ok: true });
    },
  }),
];
