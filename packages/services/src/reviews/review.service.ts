import type { PgVector } from '@typhoon/db/drivers/pg';
import type { ReviewRepo } from '@typhoon/db/repos';

import { hydrateChunkSources } from '../threads/hydrate-chunks';
import { isSystemReminder, toThreadResponse, toUIMessage } from '../threads/thread.service';
import type { Result } from '../types';

export interface ReviewServiceDeps {
  reviewRepo: ReviewRepo;
  vectorStore: PgVector;
}

export class ReviewService {
  constructor(private deps: ReviewServiceDeps) {}

  /** List all threads with aggregate score/feedback data for admin review. */
  async listThreadsForReview(options: { sortBy?: string; annotationStatus?: string }): Promise<
    Result<{
      threads: Array<Record<string, unknown>>;
      total: number;
    }>
  > {
    const { sortBy = 'newest', annotationStatus = 'all' } = options;

    const allThreads = await this.deps.reviewRepo.listThreadsWithMessageCounts();
    const threadIds = allThreads.map((t) => t.id);

    const [aggregateRows, feedbackRows] = await Promise.all([
      this.deps.reviewRepo.getScoreAggregates(threadIds),
      this.deps.reviewRepo.getFeedbackCounts(threadIds),
    ]);

    const aggregates = new Map(
      aggregateRows.map((r) => [
        r.thread_id,
        {
          responseAvg: r.response_avg,
          retrievalAvg: r.retrieval_avg,
          scoreCount: r.score_count,
          annotationCount: r.annotation_count,
        },
      ]),
    );

    const feedbackCounts = new Map(
      feedbackRows.map((r) => [
        r.thread_id,
        { feedbackCount: r.feedback_count, negativeFeedbackCount: r.negative_feedback_count },
      ]),
    );

    const fbDefaults = { feedbackCount: 0, negativeFeedbackCount: 0 };
    const defaults = { responseAvg: null, retrievalAvg: null, scoreCount: 0, annotationCount: 0 };

    let merged = allThreads.map((t) =>
      Object.assign({}, t, aggregates.get(t.id) ?? defaults, feedbackCounts.get(t.id) ?? fbDefaults),
    );

    // Filter by annotation status
    if (annotationStatus === 'annotated') {
      merged = merged.filter((t) => t.annotationCount > 0);
    } else if (annotationStatus === 'unannotated') {
      merged = merged.filter((t) => t.annotationCount === 0);
    }

    // Sort
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

    return { data: { threads: merged as unknown as Array<Record<string, unknown>>, total: merged.length } };
  }

  /** Get thread detail with messages, scores grouped by message, and feedback. */
  async getThreadDetail(threadId: string): Promise<
    Result<{
      id: string;
      resourceId: string;
      title: string;
      metadata: Record<string, unknown> | null;
      createdAt: Date;
      updatedAt: Date;
      messages: Array<Record<string, unknown>>;
      scoresByMessage: Record<string, Array<Record<string, unknown>>>;
      feedbackByMessage: Record<
        string,
        Array<{ rating: string; comment: string | null; userName: string; createdAt: string }>
      >;
    }>
  > {
    const thread = await this.deps.reviewRepo.findThreadByExternalId(threadId);
    if (!thread) return { error: 'not-found' };

    const threadMessages = await this.deps.reviewRepo.listMessagesByThreadId(thread.id);
    const uiMessages = threadMessages.filter((msg) => !isSystemReminder(msg)).map(toUIMessage);
    await hydrateChunkSources(uiMessages, this.deps.vectorStore);

    // Fetch all scores for this thread
    const allScores = await this.deps.reviewRepo.getThreadScores(threadId);

    // Resolve annotator names for human-review scores
    const annotatorIds = [
      ...new Set(
        allScores
          .filter((s) => s.scorer_id === 'human-review')
          .map((s) => (s.metadata as Record<string, unknown> | null)?.annotatorId as string | undefined)
          .filter(Boolean),
      ),
    ] as string[];

    const annotatorNames = await this.deps.reviewRepo.getAnnotatorNames(annotatorIds);

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
    const feedbackRowsList = await this.deps.reviewRepo.getThreadFeedback(thread.id);

    const feedbackByMessage: Record<
      string,
      Array<{ rating: string; comment: string | null; userName: string; createdAt: string }>
    > = {};
    for (const row of feedbackRowsList) {
      const key = row.message_external_id;
      if (!feedbackByMessage[key]) feedbackByMessage[key] = [];
      feedbackByMessage[key].push({
        rating: row.rating,
        comment: row.comment,
        userName: row.user_name,
        createdAt: row.created_at,
      });
    }

    return {
      data: {
        ...toThreadResponse(thread),
        messages: uiMessages,
        scoresByMessage,
        feedbackByMessage,
      },
    };
  }

  /** Create a human annotation on a message. */
  async createAnnotation(input: {
    threadId: string;
    messageId: string;
    userId: string;
    tags: string[];
    severity?: string;
    comment?: string;
  }): Promise<Result<{ id: string; scorerId: string; entityId: string; threadId: string }>> {
    // Verify thread exists
    const thread = await this.deps.reviewRepo.findThreadByExternalId(input.threadId);
    if (!thread) return { error: 'thread-not-found' };

    // Verify message exists in this thread
    const msg = await this.deps.reviewRepo.findMessageInThread(input.messageId, thread.id);
    if (!msg) return { error: 'message-not-found' };

    // Check for existing annotation by this user
    const existing = await this.deps.reviewRepo.findAnnotation(input.messageId, input.userId);
    if (existing) return { error: 'conflict' };

    const isCorrect = input.tags.includes('correct');
    const id = crypto.randomUUID();

    await this.deps.reviewRepo.createAnnotation({
      id,
      messageId: input.messageId,
      threadId: input.threadId,
      score: isCorrect ? 1.0 : 0.0,
      comment: input.comment ?? '',
      metadata: { source: 'human', tags: input.tags, severity: input.severity ?? null, annotatorId: input.userId },
      resourceId: input.userId,
    });

    return { data: { id, scorerId: 'human-review', entityId: input.messageId, threadId: input.threadId } };
  }

  /** Update an existing annotation. */
  async updateAnnotation(input: {
    messageId: string;
    userId: string;
    tags: string[];
    severity?: string;
    comment?: string;
  }): Promise<Result<{ id: string; updated: true }>> {
    const existing = await this.deps.reviewRepo.findAnnotation(input.messageId, input.userId);
    if (!existing) return { error: 'not-found' };

    const isCorrect = input.tags.includes('correct');

    await this.deps.reviewRepo.updateAnnotation(existing.id, {
      score: isCorrect ? 1.0 : 0.0,
      comment: input.comment ?? '',
      metadata: { source: 'human', tags: input.tags, severity: input.severity ?? null, annotatorId: input.userId },
    });

    return { data: { id: existing.id, updated: true } };
  }

  /** Delete an existing annotation. */
  async deleteAnnotation(input: { messageId: string; userId: string }): Promise<Result<{ ok: true }>> {
    const existing = await this.deps.reviewRepo.findAnnotation(input.messageId, input.userId);
    if (!existing) return { error: 'not-found' };

    await this.deps.reviewRepo.deleteAnnotation(existing.id);

    return { data: { ok: true } };
  }
}
