import type { FeedbackRepo, MessageRepo, ThreadRepo } from '@typhoon/db/repos';

import type { Result } from '../types';

export interface FeedbackServiceDeps {
  feedbackRepo: FeedbackRepo;
  messageRepo: MessageRepo;
  threadRepo: ThreadRepo;
}

export class FeedbackService {
  constructor(private deps: FeedbackServiceDeps) {}

  /** Upsert or delete feedback for a message. */
  async upsertFeedback(input: {
    messageExternalId: string;
    userId: string;
    rating: 'positive' | 'negative' | null;
    comment?: string | null;
  }): Promise<Result<{ deleted?: true } | Record<string, unknown>>> {
    const msg = await this.deps.messageRepo.findByExternalId(input.messageExternalId);
    if (!msg) return { error: 'not-found' };

    // Delete case
    if (input.rating === null) {
      await this.deps.feedbackRepo.deleteByMessageAndUser(msg.id, input.userId);
      return { data: { deleted: true } };
    }

    // Check for existing
    const existing = await this.deps.feedbackRepo.findByMessageAndUser(msg.id, input.userId);

    if (existing) {
      const updated = await this.deps.feedbackRepo.update(existing.id, {
        rating: input.rating,
        comment: input.comment ?? null,
      });
      return { data: { ...updated, messageId: input.messageExternalId } };
    }

    // Create new
    const entry = await this.deps.feedbackRepo.create({
      threadId: msg.threadId,
      messageId: msg.id,
      userId: input.userId,
      rating: input.rating,
      comment: input.comment ?? null,
    });
    return { data: { ...entry, messageId: input.messageExternalId, _status: 201 as const } };
  }

  /** List feedback entries. If threadExternalId provided, scopes to that thread + user. */
  async listFeedback(input: { threadExternalId?: string; userId: string }): Promise<Result<unknown[]>> {
    if (!input.threadExternalId) {
      const entries = await this.deps.feedbackRepo.listAll();
      return { data: entries };
    }

    const thread = await this.deps.threadRepo.findByExternalId(input.threadExternalId);
    if (!thread) return { data: [] };

    const entries = await this.deps.feedbackRepo.listByThreadAndUser(thread.id, input.userId);
    return {
      data: entries.map((e) => Object.assign({}, e, { messageId: e.messageExternalId, messageExternalId: undefined })),
    };
  }
}
