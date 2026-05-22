import { ReviewRepo } from '@typhoon/db/repos';
import {
  clearAllTables,
  createTestConnection,
  seedFeedback,
  seedMessage,
  seedScore,
  seedThread,
  seedUser,
} from '@typhoon/db/repos/test-utils';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewService } from './review.service';

/** Assert the result is a success. */
function expectData<T>(result: { data: T } | { error: string }): asserts result is { data: T } {
  expect('data' in result).toBe(true);
}

describe('ReviewService (integration)', () => {
  const { db, sql } = createTestConnection();
  const mockVectorStore = { query: vi.fn().mockResolvedValue([]) } as unknown as Parameters<
    (typeof ReviewService)['prototype']['getThreadDetail']
  > extends never[]
    ? never
    : any;
  const service = new ReviewService({ reviewRepo: new ReviewRepo(db), vectorStore: mockVectorStore });

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. listThreadsForReview returns threads with aggregates ────────────

  it('listThreadsForReview returns threads with aggregates', async () => {
    const t1 = await seedThread(db, { title: 'Thread One' });
    const t2 = await seedThread(db, { title: 'Thread Two' });
    const msg1 = await seedMessage(db, t1.id);
    const msg2a = await seedMessage(db, t2.id);
    const msg2b = await seedMessage(db, t2.id);

    const user = await seedUser(db);

    // Scores for thread 1 (use externalId for threadId in scores table)
    await seedScore(db, { threadId: t1.externalId, entityId: msg1.id, scorerId: 'answerRelevancy', score: 0.8 });

    // Scores for thread 2
    await seedScore(db, { threadId: t2.externalId, entityId: msg2a.id, scorerId: 'answerRelevancy', score: 0.6 });
    await seedScore(db, { threadId: t2.externalId, entityId: msg2b.id, scorerId: 'faithfulness', score: 0.5 });

    // Feedback for thread 1
    await seedFeedback(db, { threadId: t1.id, messageId: msg1.id, userId: user.id, rating: 'positive' });

    // Feedback for thread 2
    await seedFeedback(db, { threadId: t2.id, messageId: msg2a.id, userId: user.id, rating: 'negative' });

    const result = await service.listThreadsForReview({});

    expectData(result);
    expect(result.data.threads).toHaveLength(2);

    const thread1 = result.data.threads.find((t) => (t as Record<string, unknown>).id === t1.externalId) as Record<
      string,
      unknown
    >;
    const thread2 = result.data.threads.find((t) => (t as Record<string, unknown>).id === t2.externalId) as Record<
      string,
      unknown
    >;

    expect(thread1).toBeDefined();
    expect(thread2).toBeDefined();

    // Thread 1: 1 message, 1 score, 1 feedback
    expect(thread1.message_count).toBe(1);
    expect(thread1.scoreCount).toBe(1);
    expect(thread1.feedbackCount).toBe(1);

    // Thread 2: 2 messages, 2 scores, 1 feedback
    expect(thread2.message_count).toBe(2);
    expect(thread2.scoreCount).toBe(2);
    expect(thread2.feedbackCount).toBe(1);
  });

  // ── 2. listThreadsForReview sorts by responseScore ─────────────────────

  it('listThreadsForReview sorts by responseScore', async () => {
    const tLow = await seedThread(db, { title: 'Low Score Thread' });
    const tHigh = await seedThread(db, { title: 'High Score Thread' });

    const msgLow = await seedMessage(db, tLow.id);
    const msgHigh = await seedMessage(db, tHigh.id);

    // Thread A: low responseAvg (answerRelevancy 0.2)
    await seedScore(db, { threadId: tLow.externalId, entityId: msgLow.id, scorerId: 'answerRelevancy', score: 0.2 });

    // Thread B: high responseAvg (answerRelevancy 0.9)
    await seedScore(db, {
      threadId: tHigh.externalId,
      entityId: msgHigh.id,
      scorerId: 'answerRelevancy',
      score: 0.9,
    });

    const result = await service.listThreadsForReview({ sortBy: 'responseScore' });

    expectData(result);
    expect(result.data.threads).toHaveLength(2);

    // responseScore sorts ASC (worst-first), so low score thread comes first
    const first = result.data.threads[0] as Record<string, unknown>;
    expect(first.id).toBe(tLow.externalId);

    const second = result.data.threads[1] as Record<string, unknown>;
    expect(second.id).toBe(tHigh.externalId);
  });

  // ── 3. listThreadsForReview filters annotationStatus ───────────────────

  it('listThreadsForReview filters annotationStatus', async () => {
    const tAnnotated = await seedThread(db, { title: 'Annotated Thread' });
    const tUnannotated = await seedThread(db, { title: 'Unannotated Thread' });

    const msgAnnotated = await seedMessage(db, tAnnotated.id);
    const msgUnannotated = await seedMessage(db, tUnannotated.id);

    // Add a human-review score to the annotated thread
    await seedScore(db, {
      threadId: tAnnotated.externalId,
      entityId: msgAnnotated.externalId,
      scorerId: 'human-review',
      score: 1.0,
      metadata: { source: 'human', tags: ['correct'], annotatorId: 'some-user' },
    });

    // Add a regular score to the unannotated thread (no human-review)
    await seedScore(db, {
      threadId: tUnannotated.externalId,
      entityId: msgUnannotated.id,
      scorerId: 'answerRelevancy',
      score: 0.7,
    });

    const result = await service.listThreadsForReview({ annotationStatus: 'annotated' });

    expectData(result);
    expect(result.data.threads).toHaveLength(1);
    expect((result.data.threads[0] as Record<string, unknown>).id).toBe(tAnnotated.externalId);
  });

  // ── 4. getThreadDetail returns full data ───────────────────────────────

  it('getThreadDetail returns full data', async () => {
    const user = await seedUser(db, { name: 'Reviewer' });
    const thread = await seedThread(db, { title: 'Detail Thread' });
    await seedMessage(db, thread.id, { role: 'user', content: { text: 'Hello' } });
    const msg2 = await seedMessage(db, thread.id, { role: 'assistant', content: { text: 'Hi there' } });

    // Scores for message 2 (use externalId as entity_id in scores)
    await seedScore(db, {
      threadId: thread.externalId,
      entityId: msg2.externalId,
      scorerId: 'answerRelevancy',
      score: 0.85,
    });

    // Feedback for message 2 (use internal IDs)
    await seedFeedback(db, {
      threadId: thread.id,
      messageId: msg2.id,
      userId: user.id,
      rating: 'positive',
      comment: 'Good answer',
    });

    const result = await service.getThreadDetail(thread.externalId);

    expectData(result);
    expect(result.data.id).toBe(thread.externalId);
    expect(result.data.title).toBe('Detail Thread');
    expect(result.data.messages).toHaveLength(2);

    // Scores grouped by message externalId
    expect(result.data.scoresByMessage[msg2.externalId]).toBeDefined();
    expect(result.data.scoresByMessage[msg2.externalId]).toHaveLength(1);
    expect(result.data.scoresByMessage[msg2.externalId][0].scorer_id).toBe('answerRelevancy');

    // Feedback grouped by message externalId
    expect(result.data.feedbackByMessage[msg2.externalId]).toBeDefined();
    expect(result.data.feedbackByMessage[msg2.externalId]).toHaveLength(1);
    expect(result.data.feedbackByMessage[msg2.externalId][0].rating).toBe('positive');
    expect(result.data.feedbackByMessage[msg2.externalId][0].userName).toBe('Reviewer');
  });

  // ── 5. createAnnotation + updateAnnotation + deleteAnnotation CRUD ─────

  it('createAnnotation + updateAnnotation + deleteAnnotation CRUD', async () => {
    const user = await seedUser(db, { name: 'Annotator' });
    const thread = await seedThread(db);
    const msg = await seedMessage(db, thread.id);

    // Create annotation with tags: ['incorrect'] => score=0.0
    const createResult = await service.createAnnotation({
      threadId: thread.externalId,
      messageId: msg.externalId,
      userId: user.id,
      tags: ['incorrect'],
      comment: 'Wrong answer',
    });

    expectData(createResult);
    expect(createResult.data.scorerId).toBe('human-review');
    expect(createResult.data.entityId).toBe(msg.externalId);

    // Verify score=0.0 via getThreadDetail
    const detailAfterCreate = await service.getThreadDetail(thread.externalId);
    expectData(detailAfterCreate);
    const scoresAfterCreate = detailAfterCreate.data.scoresByMessage[msg.externalId];
    expect(scoresAfterCreate).toBeDefined();
    const annotation = scoresAfterCreate.find((s) => s.scorer_id === 'human-review');
    expect(annotation).toBeDefined();
    expect(annotation?.score).toBeCloseTo(0.0, 2);

    // Update annotation to tags: ['correct'] => score=1.0
    const updateResult = await service.updateAnnotation({
      messageId: msg.externalId,
      userId: user.id,
      tags: ['correct'],
      comment: 'Actually correct',
    });

    expectData(updateResult);
    expect(updateResult.data.updated).toBe(true);

    // Verify score=1.0 via getThreadDetail
    const detailAfterUpdate = await service.getThreadDetail(thread.externalId);
    expectData(detailAfterUpdate);
    const scoresAfterUpdate = detailAfterUpdate.data.scoresByMessage[msg.externalId];
    const updatedAnnotation = scoresAfterUpdate.find((s) => s.scorer_id === 'human-review');
    expect(updatedAnnotation?.score).toBeCloseTo(1.0, 2);

    // Delete annotation
    const deleteResult = await service.deleteAnnotation({
      messageId: msg.externalId,
      userId: user.id,
    });

    expectData(deleteResult);
    expect(deleteResult.data.ok).toBe(true);

    // Verify annotation is gone
    const detailAfterDelete = await service.getThreadDetail(thread.externalId);
    expectData(detailAfterDelete);
    const scoresAfterDelete = detailAfterDelete.data.scoresByMessage[msg.externalId] ?? [];
    const deletedAnnotation = scoresAfterDelete.find((s) => s.scorer_id === 'human-review');
    expect(deletedAnnotation).toBeUndefined();
  });
});
