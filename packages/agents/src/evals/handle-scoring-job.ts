import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createContextPrecisionScorer,
  createContextRelevanceScorerLLM,
  createFaithfulnessScorer,
  createHallucinationScorer,
} from '@mastra/evals/scorers/prebuilt';
import { createAppLogger } from '@typhoon/logger';
import { extractScoringData } from './extract-scoring-data';
import { constructScorer, type ScorerDefinitionVersion } from './scorer-loader';

const log = createAppLogger('scoring');

export interface ScoringInput {
  /** `messages.externalId` — may be empty if the worker should resolve the latest assistant message. */
  messageId: string;
  threadId: string;
  agentId: string;
  traceId: string | null;
}

export interface ScoringDeps {
  /** Fetch the assistant message content and preceding user message content by message externalId. */
  fetchMessages: (messageId: string) => Promise<{
    assistantContent: unknown;
    userContent: unknown;
    messageExternalId: string;
  } | null>;
  /** Resolve the latest assistant message externalId in a thread (by thread externalId). */
  resolveLatestAssistantMessage: (threadExternalId: string) => Promise<string | null>;
  /** Hydrate chunk text from vector store by chunk IDs. Returns map of chunkId → text. */
  hydrateChunks: (chunkIds: string[]) => Promise<Map<string, string>>;
  /** Check if a score already exists for this entity + scorer. */
  hasExistingScore: (entityId: string, scorerId: string) => Promise<boolean>;
  /** Persist a score record. */
  saveScore: (score: Record<string, unknown>) => Promise<void>;
}

export interface ScoringResult {
  scored: number;
  skipped: number;
  errors: string[];
}

/**
 * Core scoring logic: extract data from messages, run scorers, save scores.
 *
 * Designed to be called from a BullMQ job handler. The caller provides
 * dependency functions for DB access so this module stays decoupled from
 * database/queue libraries.
 *
 * When `scorerDefinitions` is provided, constructs scorers from database
 * definitions. Otherwise falls back to the 5 hardcoded RAG scorers.
 *
 * @throws Error with `unrecoverable: true` property for permanent failures
 *         (missing message, un-extractable data) — the caller should not retry.
 */
export async function scoreMessage(
  input: ScoringInput,
  deps: ScoringDeps,
  model: MastraModelConfig,
  scorerDefinitions?: ScorerDefinitionVersion[],
): Promise<ScoringResult> {
  const { threadId, agentId, traceId } = input;
  let { messageId } = input;

  // 0. Resolve messageId if not provided (chat handler doesn't know it at enqueue time)
  if (!messageId) {
    const resolved = await deps.resolveLatestAssistantMessage(threadId);
    if (!resolved) {
      throw Object.assign(new Error(`No assistant message found in thread: ${threadId}`), { unrecoverable: true });
    }
    messageId = resolved;
  }

  // 1. Fetch messages
  const msgData = await deps.fetchMessages(messageId);
  if (!msgData) {
    throw Object.assign(new Error(`Message not found: ${messageId}`), { unrecoverable: true });
  }

  // 2. Extract scoring data from message JSONB
  const scoringData = extractScoringData(msgData.assistantContent, msgData.userContent);
  if (!scoringData) {
    throw Object.assign(new Error(`Cannot extract scoring data from message: ${messageId}`), { unrecoverable: true });
  }

  // 3. Hydrate chunk text if needed
  if (scoringData.chunkSources.length > 0) {
    const needsHydration = scoringData.chunkSources.some((cs) => !cs.text);
    if (needsHydration) {
      const chunkIds = scoringData.chunkSources.map((cs) => cs.chunkId);
      const textMap = await deps.hydrateChunks(chunkIds);
      for (const cs of scoringData.chunkSources) {
        if (!cs.text) cs.text = textMap.get(cs.chunkId) ?? '';
      }
    }
  }

  // 4. Build context array for scorers
  const context = scoringData.chunkSources
    .filter((cs): cs is typeof cs & { text: string } => !!cs.text)
    .map((cs) => cs.text);

  // 5. Create scorers — from DB definitions if provided, otherwise hardcoded defaults
  const scorerEntries = scorerDefinitions
    ? scorerDefinitions
        .map((def) => constructScorer(def, model, context))
        .filter((e): e is NonNullable<typeof e> => e !== null)
    : createScorerEntries(model, context);
  const result: ScoringResult = { scored: 0, skipped: 0, errors: [] };

  for (const { id: scorerId, scorer } of scorerEntries) {
    // Idempotency: skip if score already exists
    const exists = await deps.hasExistingScore(messageId, scorerId);
    if (exists) {
      result.skipped++;
      continue;
    }

    try {
      // Mastra prebuilt scorers expect structured MastraDBMessage objects.
      // getTextContentFromMastraDBMessage reads message.content.content or message.content.parts
      const scorerInput = {
        inputMessages: [{ role: 'user' as const, content: { content: scoringData.userQuestion } }],
        rememberedMessages: [],
        systemMessages: [],
        taggedSystemMessages: {},
      };
      const scorerOutput = [{ role: 'assistant' as const, content: { content: scoringData.responseText } }];

      // biome-ignore lint/suspicious/noExplicitAny: Scorer run() types vary between prebuilt scorers
      const scorerResult = await (scorer as any).run({
        input: scorerInput,
        output: scorerOutput,
      });

      await deps.saveScore({
        id: crypto.randomUUID(),
        scorerId,
        traceId: traceId ?? undefined,
        score: scorerResult.score,
        reason: scorerResult.reason ?? '',
        entityType: 'message',
        entityId: messageId,
        threadId,
        input: JSON.stringify({ userQuestion: scoringData.userQuestion }),
        output: JSON.stringify({ responseText: scoringData.responseText }),
        additionalContext: JSON.stringify({ context, agentId }),
        metadata: JSON.stringify({ scorerVersion: 1 }),
      });
      result.scored++;
      log.debug('Score saved', { messageId, scorerId, score: scorerResult.score });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${scorerId}: ${msg}`);
      log.error('Scorer failed', { messageId, scorerId, error: msg });
      // Re-throw to trigger BullMQ retry — idempotency check skips
      // scorers that already succeeded on next attempt
      throw err;
    }
  }

  return result;
}

/**
 * Create RAG scorers with the given context baked in.
 *
 * When context is non-empty, all 5 scorers run. When context is empty
 * (direct answer without RAG), only answerRelevancy runs — the other 4
 * require a non-empty context array.
 */
function createScorerEntries(model: MastraModelConfig, context: string[]) {
  // biome-ignore lint/suspicious/noExplicitAny: Scorer generics vary between prebuilt scorer types
  const entries: Array<{ id: string; scorer: any }> = [];

  // answerRelevancy doesn't need context — always include it
  entries.push({
    id: 'answerRelevancy',
    scorer: createAnswerRelevancyScorer({ model }),
  });

  // Context-dependent scorers: only when chunks were retrieved
  if (context.length > 0) {
    entries.push(
      { id: 'faithfulness', scorer: createFaithfulnessScorer({ model, options: { context } }) },
      { id: 'hallucination', scorer: createHallucinationScorer({ model, options: { context } }) },
      { id: 'contextRelevance', scorer: createContextRelevanceScorerLLM({ model, options: { context } }) },
      { id: 'contextPrecision', scorer: createContextPrecisionScorer({ model, options: { context } }) },
    );
  }

  return entries;
}
