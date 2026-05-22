import { and, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { feedback } from '../schema/feedback';
import { messages } from '../schema/messages';

export class FeedbackRepo {
  constructor(private db: Db) {}

  /** Find existing feedback by message + user. */
  async findByMessageAndUser(messageId: string, userId: string) {
    const [existing] = await this.db
      .select({ id: feedback.id })
      .from(feedback)
      .where(and(eq(feedback.messageId, messageId), eq(feedback.userId, userId)));
    return existing ?? null;
  }

  /** Delete feedback for a specific message + user. */
  async deleteByMessageAndUser(messageId: string, userId: string) {
    await this.db.delete(feedback).where(and(eq(feedback.messageId, messageId), eq(feedback.userId, userId)));
  }

  /** Update an existing feedback entry. */
  async update(id: string, data: { rating: 'positive' | 'negative'; comment: string | null }) {
    const [updated] = await this.db
      .update(feedback)
      .set({ rating: data.rating, comment: data.comment })
      .where(eq(feedback.id, id))
      .returning();
    return updated;
  }

  /** Create a new feedback entry. */
  async create(data: {
    threadId: string;
    messageId: string;
    userId: string;
    rating: 'positive' | 'negative';
    comment: string | null;
  }) {
    const [entry] = await this.db.insert(feedback).values(data).returning();
    return entry;
  }

  /** List all feedback entries (admin). */
  async listAll() {
    return this.db.select().from(feedback);
  }

  /** List feedback for a thread, scoped to a user, with message external IDs. */
  async listByThreadAndUser(threadId: string, userId: string) {
    return this.db
      .select({
        id: feedback.id,
        messageExternalId: messages.externalId,
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .innerJoin(messages, eq(feedback.messageId, messages.id))
      .where(and(eq(feedback.threadId, threadId), eq(feedback.userId, userId)));
  }
}
