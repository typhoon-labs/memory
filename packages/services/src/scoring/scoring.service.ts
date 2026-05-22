import type { PgVector } from '@typhoon/db/drivers/pg';
import type { MessageRepo, ScoreRepo, ThreadRepo } from '@typhoon/db/repos';
import type { ScoringDeps } from '@typhoon/evals';

export interface ScoringServiceDeps {
  messageRepo: MessageRepo;
  threadRepo: ThreadRepo;
  scoreRepo: ScoreRepo;
  vectorStore: PgVector;
}

export class ScoringService {
  constructor(private deps: ScoringServiceDeps) {}

  /** Fetch assistant + user messages for scoring a given message. */
  async fetchMessages(messageExternalId: string): Promise<{
    assistantContent: Record<string, unknown>;
    userContent: Record<string, unknown>;
    messageExternalId: string;
  } | null> {
    const assistantMsg = await this.deps.messageRepo.findByExternalId(messageExternalId);
    if (!assistantMsg) return null;

    // The MessageRepo only returns id + threadId; for scoring we need full content.
    // Use the listByThreadId and find the specific messages.
    const threadMessages = await this.deps.messageRepo.listByThreadId(assistantMsg.threadId);

    const fullAssistant = threadMessages.find((m) => m.externalId === messageExternalId);
    if (!fullAssistant) return null;

    // Find the latest user message that is not a PrefillErrorHandler retry message
    const userMessages = threadMessages
      .filter((m) => {
        if (m.role !== 'user') return false;
        const content = m.content as { metadata?: { systemReminder?: unknown } };
        return content?.metadata?.systemReminder === null || content?.metadata?.systemReminder === undefined;
      })
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const userMsg = userMessages[0];
    if (!userMsg) return null;

    return {
      assistantContent: fullAssistant.content,
      userContent: userMsg.content,
      messageExternalId: fullAssistant.externalId,
    };
  }

  /** Resolve the latest assistant message external ID in a thread. */
  async resolveLatestAssistantMessage(threadExternalId: string): Promise<string | null> {
    const thread = await this.deps.threadRepo.findByExternalId(threadExternalId);
    if (!thread) return null;

    const threadMessages = await this.deps.messageRepo.listByThreadId(thread.id);
    const assistantMessages = threadMessages
      .filter((m) => m.role === 'assistant')
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return assistantMessages[0]?.externalId ?? null;
  }

  /** Hydrate chunk IDs to metadata from the vector store. */
  async hydrateChunks(
    chunkIds: string[],
  ): Promise<
    Map<string, { text?: string; title?: string; source?: string; section?: string; syncTargetName?: string }>
  > {
    if (chunkIds.length === 0) return new Map();
    const rows = await this.deps.vectorStore.getChunksByIds('knowledge_base', chunkIds);

    // Resolve sync target names from IDs
    const syncTargetIds = new Set<string>();
    for (const r of rows) {
      const stId = r.metadata?.syncTargetId as string | undefined;
      if (stId) syncTargetIds.add(stId);
    }
    const syncTargetNames =
      syncTargetIds.size > 0
        ? await this.deps.vectorStore.getSyncTargetNames([...syncTargetIds])
        : new Map<string, string>();

    return new Map(
      rows.map((r) => [
        r.id,
        {
          text: (r.metadata?.text as string) ?? undefined,
          title: (r.metadata?.title as string) ?? undefined,
          source: (r.metadata?.source as string) ?? undefined,
          section: (r.metadata?.section as string) ?? undefined,
          syncTargetName: syncTargetNames.get(r.metadata?.syncTargetId as string) ?? undefined,
        },
      ]),
    );
  }

  /** Check if a score already exists for the given entity and scorer. */
  async hasExistingScore(entityId: string, scorerId: string): Promise<boolean> {
    return this.deps.scoreRepo.hasExistingScore(entityId, scorerId);
  }

  /** Persist a score to the database. */
  async saveScore(score: Record<string, unknown>): Promise<void> {
    return this.deps.scoreRepo.saveScore(score);
  }

  /**
   * Return an object that satisfies the `ScoringDeps` interface from `@typhoon/evals`.
   * Methods are bound so they can be passed around freely.
   */
  toScoringDeps(): ScoringDeps {
    return {
      fetchMessages: this.fetchMessages.bind(this),
      resolveLatestAssistantMessage: this.resolveLatestAssistantMessage.bind(this),
      hydrateChunks: this.hydrateChunks.bind(this),
      hasExistingScore: this.hasExistingScore.bind(this),
      saveScore: this.saveScore.bind(this),
    };
  }
}
