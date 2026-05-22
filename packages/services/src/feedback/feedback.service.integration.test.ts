import { FeedbackRepo, MessageRepo, ThreadRepo } from '@typhoon/db/repos';
import { clearAllTables, createTestConnection, seedMessage, seedThread, seedUser } from '@typhoon/db/repos/test-utils';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { FeedbackService } from './feedback.service';

// Helper to assert a result is a success
function expectData<T>(result: { data: T } | { error: string }): asserts result is { data: T } {
  expect('data' in result).toBe(true);
}

function expectError(result: { data: unknown } | { error: string }): asserts result is { error: string } {
  expect('error' in result).toBe(true);
}

describe('FeedbackService (integration)', () => {
  const { db, sql } = createTestConnection();
  const service = new FeedbackService({
    feedbackRepo: new FeedbackRepo(db),
    messageRepo: new MessageRepo(db),
    threadRepo: new ThreadRepo(db),
  });

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  it('creates feedback for an existing message', async () => {
    const user = await seedUser(db);
    const thread = await seedThread(db);
    const msg = await seedMessage(db, thread.id);

    const result = await service.upsertFeedback({
      messageExternalId: msg.externalId,
      userId: user.id,
      rating: 'positive',
      comment: 'Great answer',
    });

    expectData(result);
    expect((result.data as Record<string, unknown>).rating).toBe('positive');
  });

  it('updates existing feedback on second call', async () => {
    const user = await seedUser(db);
    const thread = await seedThread(db);
    const msg = await seedMessage(db, thread.id);

    await service.upsertFeedback({
      messageExternalId: msg.externalId,
      userId: user.id,
      rating: 'positive',
    });

    const result = await service.upsertFeedback({
      messageExternalId: msg.externalId,
      userId: user.id,
      rating: 'negative',
      comment: 'Actually bad',
    });

    expectData(result);
    expect((result.data as Record<string, unknown>).rating).toBe('negative');
  });

  it('deletes feedback when rating is null', async () => {
    const user = await seedUser(db);
    const thread = await seedThread(db);
    const msg = await seedMessage(db, thread.id);

    await service.upsertFeedback({
      messageExternalId: msg.externalId,
      userId: user.id,
      rating: 'positive',
    });

    const result = await service.upsertFeedback({
      messageExternalId: msg.externalId,
      userId: user.id,
      rating: null,
    });

    expectData(result);
    expect((result.data as Record<string, unknown>).deleted).toBe(true);
  });

  it('returns error for nonexistent message', async () => {
    const user = await seedUser(db);
    const result = await service.upsertFeedback({
      messageExternalId: 'nonexistent-msg',
      userId: user.id,
      rating: 'positive',
    });

    expectError(result);
    expect(result.error).toBe('not-found');
  });

  it('listFeedback returns entries scoped to thread and user', async () => {
    const user = await seedUser(db);
    const thread = await seedThread(db);
    const msg1 = await seedMessage(db, thread.id, { role: 'assistant', content: { text: 'A' } });
    const msg2 = await seedMessage(db, thread.id, { role: 'assistant', content: { text: 'B' } });

    await service.upsertFeedback({ messageExternalId: msg1.externalId, userId: user.id, rating: 'positive' });
    await service.upsertFeedback({ messageExternalId: msg2.externalId, userId: user.id, rating: 'negative' });

    const result = await service.listFeedback({
      threadExternalId: thread.externalId,
      userId: user.id,
    });

    expectData(result);
    expect(result.data).toHaveLength(2);
  });

  it('listFeedback returns empty for nonexistent thread', async () => {
    const user = await seedUser(db);
    const result = await service.listFeedback({
      threadExternalId: 'nonexistent-thread',
      userId: user.id,
    });

    expectData(result);
    expect(result.data).toEqual([]);
  });
});
