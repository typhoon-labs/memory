import crypto from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { ReviewRepo } from './review.repo';
import {
  clearAllTables,
  createTestConnection,
  seedFeedback,
  seedMessage,
  seedScore,
  seedThread,
  seedUser,
} from './test-utils';

describe('ReviewRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new ReviewRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. listThreadsWithMessageCounts ──────────────────────────────────

  it('listThreadsWithMessageCounts returns counts per thread', async () => {
    const t1 = await seedThread(db, { title: 'Thread A' });
    const t2 = await seedThread(db, { title: 'Thread B' });

    // 3 messages in t1, 0 in t2
    await seedMessage(db, t1.id);
    await seedMessage(db, t1.id);
    await seedMessage(db, t1.id);

    const rows = await repo.listThreadsWithMessageCounts();

    expect(rows).toHaveLength(2);

    const rowA = rows.find((r) => r.id === t1.externalId);
    const rowB = rows.find((r) => r.id === t2.externalId);

    expect(rowA?.message_count).toBe(3);
    expect(rowA?.title).toBe('Thread A');

    expect(rowB?.message_count).toBe(0);
  });

  // ── 2. getScoreAggregates computes AVG ───────────────────────────────

  it('getScoreAggregates computes response_avg and retrieval_avg', async () => {
    const t = await seedThread(db);
    const msg = await seedMessage(db, t.id);

    // Response scores: answerRelevancy=0.8, faithfulness=0.6, hallucination=0.3 (becomes 1-0.3=0.7)
    // response_avg = (0.8 + 0.6 + 0.7) / 3 = 0.7
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'answerRelevancy',
      score: 0.8,
    });
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'faithfulness',
      score: 0.6,
    });
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'hallucination',
      score: 0.3,
    });

    // Retrieval scores: contextRelevance=0.9, contextPrecision=0.5
    // retrieval_avg = (0.9 + 0.5) / 2 = 0.7
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'contextRelevance',
      score: 0.9,
    });
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'contextPrecision',
      score: 0.5,
    });

    // One human-review annotation (should appear in annotation_count)
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'human-review',
      score: 1,
      metadata: { annotatorId: 'some-user' },
    });

    const rows = await repo.getScoreAggregates([t.externalId]);

    expect(rows).toHaveLength(1);
    const agg = rows[0];
    expect(agg.thread_id).toBe(t.externalId);

    // response_avg: (0.8 + 0.6 + 0.7) / 3 ≈ 0.7
    expect(agg.response_avg).toBeCloseTo(0.7, 1);
    // retrieval_avg: (0.9 + 0.5) / 2 = 0.7
    expect(agg.retrieval_avg).toBeCloseTo(0.7, 1);
    // 5 non-human-review scores
    expect(agg.score_count).toBe(5);
    // 1 human-review annotation
    expect(agg.annotation_count).toBe(1);
  });

  // ── 3. getScoreAggregates empty array ────────────────────────────────

  it('getScoreAggregates returns [] for empty threadIds', async () => {
    const rows = await repo.getScoreAggregates([]);
    expect(rows).toEqual([]);
  });

  // ── 4. getFeedbackCounts ─────────────────────────────────────────────

  it('getFeedbackCounts computes total and negative counts', async () => {
    const t = await seedThread(db);
    const msg = await seedMessage(db, t.id);
    const u = await seedUser(db);

    // 2 positive + 1 negative
    await seedFeedback(db, { threadId: t.id, messageId: msg.id, userId: u.id, rating: 'positive' });
    await seedFeedback(db, { threadId: t.id, messageId: msg.id, userId: u.id, rating: 'positive' });
    await seedFeedback(db, { threadId: t.id, messageId: msg.id, userId: u.id, rating: 'negative' });

    const rows = await repo.getFeedbackCounts([t.externalId]);

    expect(rows).toHaveLength(1);
    expect(rows[0].thread_id).toBe(t.externalId);
    expect(rows[0].feedback_count).toBe(3);
    expect(rows[0].negative_feedback_count).toBe(1);
  });

  // ── 5. getThreadFeedback joins 3 tables ──────────────────────────────

  it('getThreadFeedback returns rows with message_external_id and user_name', async () => {
    const t = await seedThread(db);
    const msg = await seedMessage(db, t.id);
    const u = await seedUser(db, { name: 'Alice' });

    await seedFeedback(db, {
      threadId: t.id,
      messageId: msg.id,
      userId: u.id,
      rating: 'negative',
      comment: 'Bad answer',
    });

    const rows = await repo.getThreadFeedback(t.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe('negative');
    expect(rows[0].comment).toBe('Bad answer');
    expect(rows[0].user_name).toBe('Alice');
    expect(rows[0].message_external_id).toBe(msg.externalId);
  });

  // ── 6. Annotation CRUD ──────────────────────────────────────────────

  it('annotation CRUD: create, find, update, delete', async () => {
    const t = await seedThread(db);
    const msg = await seedMessage(db, t.id);
    const u = await seedUser(db, { name: 'Bob' });
    const annotationId = crypto.randomUUID();

    // Create
    await repo.createAnnotation({
      id: annotationId,
      messageId: msg.id,
      threadId: t.externalId,
      score: 0.8,
      comment: 'Looks good',
      metadata: { annotatorId: u.id, annotatorName: u.name },
      resourceId: t.resourceId,
    });

    // Find
    const found = await repo.findAnnotation(msg.id, u.id);
    expect(found?.id).toBe(annotationId);

    // Update
    await repo.updateAnnotation(annotationId, {
      score: 0.5,
      comment: 'Actually mediocre',
      metadata: { annotatorId: u.id, annotatorName: u.name },
    });

    // Verify update via getThreadScores
    const allScores = await repo.getThreadScores(t.externalId);
    const updated = allScores.find((s) => s.id === annotationId);
    expect(updated?.score).toBeCloseTo(0.5, 2);
    expect(updated?.reason).toBe('Actually mediocre');

    // Delete
    await repo.deleteAnnotation(annotationId);

    const afterDelete = await repo.findAnnotation(msg.id, u.id);
    expect(afterDelete).toBeNull();
  });

  // ── 7. getAnnotatorNames ─────────────────────────────────────────────

  it('getAnnotatorNames returns Map with correct entries', async () => {
    const u1 = await seedUser(db, { name: 'Alice' });
    const u2 = await seedUser(db, { name: 'Bob' });

    const nameMap = await repo.getAnnotatorNames([u1.id, u2.id]);

    expect(nameMap).toBeInstanceOf(Map);
    expect(nameMap.size).toBe(2);
    expect(nameMap.get(u1.id)).toBe('Alice');
    expect(nameMap.get(u2.id)).toBe('Bob');
  });

  // ── 8. getThreadScores ───────────────────────────────────────────────

  it('getThreadScores returns all scores for a thread by externalId', async () => {
    const t = await seedThread(db);
    const msg = await seedMessage(db, t.id);

    await seedScore(db, { threadId: t.externalId, entityId: msg.id, scorerId: 'answerRelevancy', score: 0.9 });
    await seedScore(db, { threadId: t.externalId, entityId: msg.id, scorerId: 'faithfulness', score: 0.7 });
    await seedScore(db, { threadId: t.externalId, entityId: msg.id, scorerId: 'contextRelevance', score: 0.6 });

    const rows = await repo.getThreadScores(t.externalId);

    expect(rows).toHaveLength(3);
    const scorerIds = rows.map((r) => r.scorer_id);
    expect(scorerIds).toContain('answerRelevancy');
    expect(scorerIds).toContain('faithfulness');
    expect(scorerIds).toContain('contextRelevance');
  });

  // ── 9. getScoreAggregates handles NULL scores ────────────────────────

  it('getScoreAggregates handles score with value 0', async () => {
    const t = await seedThread(db);
    const msg = await seedMessage(db, t.id);

    // score=0 for hallucination becomes 1-0=1 in response_avg
    await seedScore(db, {
      threadId: t.externalId,
      entityId: msg.id,
      scorerId: 'hallucination',
      score: 0,
    });

    const rows = await repo.getScoreAggregates([t.externalId]);

    expect(rows).toHaveLength(1);
    // 1 - 0 = 1.0
    expect(rows[0].response_avg).toBeCloseTo(1.0, 2);
    // No retrieval scores
    expect(rows[0].retrieval_avg).toBeNull();
    expect(rows[0].score_count).toBe(1);
    expect(rows[0].annotation_count).toBe(0);
  });

  // ── 10. getFeedbackCounts empty array ────────────────────────────────

  it('getFeedbackCounts returns [] for empty threadIds', async () => {
    const rows = await repo.getFeedbackCounts([]);
    expect(rows).toEqual([]);
  });
});
