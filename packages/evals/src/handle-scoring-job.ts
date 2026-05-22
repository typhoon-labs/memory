import { createAppLogger } from '@typhoon/logger';

import { extractScoringData, formatResponseForScoring } from './extract-scoring-data';
import { RETRIEVAL_SCORERS } from './scorer-categories';
import { constructScorer, type ModelFactory, type ScorerDefinitionVersion } from './scorer-loader';

const log = createAppLogger('scoring');

// ── Types ───────────────────────────────────────────────────────────

/** Chunk metadata returned by hydrateChunks. */
export interface ChunkMeta {
  text?: string;
  title?: string;
  source?: string;
  section?: string;
  syncTargetName?: string;
}

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
  /** Hydrate chunk metadata from vector store by chunk IDs. */
  hydrateChunks: (chunkIds: string[]) => Promise<Map<string, ChunkMeta>>;
  /** Check if a score already exists for this entity + scorer. */
  hasExistingScore: (entityId: string, scorerId: string) => Promise<boolean>;
  /** Persist a score record. */
  saveScore: (score: Record<string, unknown>) => Promise<void>;
}

export interface PreparedScoring {
  messageId: string;
  userQuestion: string;
  responseText: string;
  context: string[];
  /** Scorers that should run (after filtering by context and idempotency). */
  scorersToRun: ScorerDefinitionVersion[];
  /** Number of scorers skipped because a score already exists. */
  skippedCount: number;
  /** Retrieval scorers skipped because context was empty. */
  contextSkippedScorers: ScorerDefinitionVersion[];
}

export interface ScorerRunResult {
  scorerId: string;
  score: number;
  reason: string;
  skipped?: boolean;
}

// ── Builtin scorer definitions ──────────────────────────────────────

/** Synthetic ScorerDefinitionVersion objects for the 5 prebuilt RAG scorers. */
export const BUILTIN_SCORER_DEFS: ScorerDefinitionVersion[] = [
  {
    id: 'answerRelevancy',
    name: 'answerRelevancy',
    type: 'answerRelevancy',
    description: null,
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
  },
  {
    id: 'faithfulness',
    name: 'faithfulness',
    type: 'faithfulness',
    description: null,
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
  },
  {
    id: 'hallucination',
    name: 'hallucination',
    type: 'hallucination',
    description: null,
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
  },
  {
    id: 'contextRelevance',
    name: 'contextRelevance',
    type: 'contextRelevance',
    description: null,
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
  },
  {
    id: 'contextPrecision',
    name: 'contextPrecision',
    type: 'contextPrecision',
    description: null,
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
  },
];

// ── prepareScoring ──────────────────────────────────────────────────

/**
 * Prepare scoring data: resolve message, extract content, hydrate chunks,
 * determine applicable scorers, and check idempotency.
 *
 * Returns the data needed to create score-run child jobs.
 *
 * @throws Error with `unrecoverable: true` property for permanent failures
 *         (missing message, un-extractable data) — the caller should not retry.
 */
export async function prepareScoring(
  input: ScoringInput,
  deps: Pick<ScoringDeps, 'fetchMessages' | 'resolveLatestAssistantMessage' | 'hydrateChunks' | 'hasExistingScore'>,
  createScoringModel: ModelFactory,
  scorerDefinitions?: ScorerDefinitionVersion[],
): Promise<PreparedScoring> {
  const { threadId } = input;
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

  // 3. Hydrate chunk metadata (text, title, source, etc.) from vector store
  if (scoringData.chunkSources.length > 0) {
    const chunkIds = scoringData.chunkSources.map((cs) => cs.chunkId);
    const metaMap = await deps.hydrateChunks(chunkIds);
    for (const cs of scoringData.chunkSources) {
      const meta = metaMap.get(cs.chunkId);
      if (!meta) continue;
      if (!cs.text && meta.text) cs.text = meta.text;
      if (!cs.title && meta.title) cs.title = meta.title;
      if (!cs.source && meta.source) cs.source = meta.source;
      if (!cs.section && meta.section) cs.section = meta.section;
      if (!cs.syncTargetName && meta.syncTargetName) cs.syncTargetName = meta.syncTargetName;
    }
  }

  // 4. Format response text for scorer readability (collapse [Source: N.M] → [N])
  const responseText = formatResponseForScoring(scoringData.responseText, scoringData.chunkSources);

  // 5. Build context array for scorers
  const context = scoringData.chunkSources
    .filter((cs): cs is typeof cs & { text: string } => !!cs.text)
    .map((cs) => cs.text);

  // 6. Determine applicable scorers and check idempotency
  const defs = scorerDefinitions ?? BUILTIN_SCORER_DEFS;
  const scorersToRun: ScorerDefinitionVersion[] = [];
  const contextSkippedScorers: ScorerDefinitionVersion[] = [];
  let skippedCount = 0;

  for (const def of defs) {
    // Check if scorer can be constructed (handles context-dependency, unknown types)
    const entry = constructScorer(def, createScoringModel, context);
    if (!entry) {
      // Track retrieval scorers skipped due to empty context
      if (RETRIEVAL_SCORERS.has(def.type) && context.length === 0) {
        contextSkippedScorers.push(def);
      }
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- sequential: idempotency check per scorer
    const exists = await deps.hasExistingScore(messageId, entry.id);
    if (exists) {
      skippedCount++;
    } else {
      scorersToRun.push(def);
    }
  }

  log.info('Scoring prepared', {
    messageId,
    threadId,
    applicable: scorersToRun.length,
    skipped: skippedCount,
    contextSkipped: contextSkippedScorers.length,
  });

  return {
    messageId,
    userQuestion: scoringData.userQuestion,
    responseText,
    context,
    scorersToRun,
    skippedCount,
    contextSkippedScorers,
  };
}

// ── runSingleScorer ─────────────────────────────────────────────────

/**
 * Run a single scorer against pre-extracted content and optionally persist the score.
 *
 * Designed to be called from a BullMQ score-run job handler. Each invocation
 * constructs one scorer, runs it, optionally saves to DB, and returns the result.
 *
 * @throws on scorer failure — BullMQ will retry the individual job.
 */
export async function runSingleScorer(
  data: {
    scorerDefinition: ScorerDefinitionVersion;
    userQuestion: string;
    responseText: string;
    context: string[];
    persist?: {
      messageId: string;
      threadId: string;
      agentId: string;
      traceId: string | null;
    };
  },
  deps: Pick<ScoringDeps, 'hasExistingScore' | 'saveScore'>,
  createScoringModel: ModelFactory,
): Promise<ScorerRunResult> {
  const { scorerDefinition, userQuestion, responseText, context, persist } = data;

  // Construct scorer from definition
  const entry = constructScorer(scorerDefinition, createScoringModel, context);
  if (!entry) {
    throw Object.assign(new Error(`Cannot construct scorer: ${scorerDefinition.name}`), { unrecoverable: true });
  }

  const { id: scorerId, scorer } = entry;

  // Idempotency check (retry safety — score may have been saved in a previous attempt)
  if (persist) {
    const exists = await deps.hasExistingScore(persist.messageId, scorerId);
    if (exists) {
      log.debug('Score already exists, skipping', { messageId: persist.messageId, scorerId });
      return { scorerId, score: -1, reason: 'skipped (idempotent)', skipped: true };
    }
  }

  // Build scorer input/output in the format Mastra prebuilt scorers expect
  const scorerInput = {
    inputMessages: [{ role: 'user' as const, content: { content: userQuestion } }],
    rememberedMessages: [],
    systemMessages: [],
    taggedSystemMessages: {},
  };
  const scorerOutput = [{ role: 'assistant' as const, content: { content: responseText } }];

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Scorer run() types vary between prebuilt scorers
  const scorerResult = await (scorer as any).run({
    input: scorerInput,
    output: scorerOutput,
  });

  // Optionally persist score (reviews set persist, experiments don't)
  if (persist) {
    await deps.saveScore({
      id: crypto.randomUUID(),
      scorerId,
      traceId: persist.traceId ?? undefined,
      score: scorerResult.score,
      reason: scorerResult.reason ?? '',
      entityType: 'message',
      entityId: persist.messageId,
      threadId: persist.threadId,
      input: JSON.stringify({ userQuestion }),
      output: JSON.stringify({ responseText }),
      additionalContext: JSON.stringify({ context, agentId: persist.agentId }),
      metadata: JSON.stringify({ scorerVersion: 1 }),
    });
    log.debug('Score saved', { messageId: persist.messageId, scorerId, score: scorerResult.score });
  }

  return { scorerId, score: scorerResult.score, reason: scorerResult.reason ?? '' };
}
