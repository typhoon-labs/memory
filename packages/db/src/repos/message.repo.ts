import { asc, eq } from 'drizzle-orm';

import type { Db } from '../client';
import { messages } from '../schema/messages';

export class MessageRepo {
  constructor(private db: Db) {}

  /** Resolve a message external ID to its internal ID and thread ID. */
  async findByExternalId(externalId: string) {
    const [msg] = await this.db
      .select({ id: messages.id, threadId: messages.threadId })
      .from(messages)
      .where(eq(messages.externalId, externalId));
    return msg ?? null;
  }

  /** List messages for a thread ordered by createdAt ASC. */
  async listByThreadId(threadId: string) {
    return this.db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(asc(messages.createdAt));
  }

  /** Delete all messages for a thread. */
  async deleteByThreadId(threadId: string) {
    await this.db.delete(messages).where(eq(messages.threadId, threadId));
  }
}
