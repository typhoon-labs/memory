import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the prebuilt scorers before importing the module
const mockRun = vi.fn();

vi.mock('@mastra/evals/scorers/prebuilt', () => {
  const makeMockScorer = () => ({ run: mockRun });
  return {
    createFaithfulnessScorer: vi.fn(makeMockScorer),
    createHallucinationScorer: vi.fn(makeMockScorer),
    createAnswerRelevancyScorer: vi.fn(makeMockScorer),
    createContextRelevanceScorerLLM: vi.fn(makeMockScorer),
    createContextPrecisionScorer: vi.fn(makeMockScorer),
  };
});

import type { ScoringDeps, ScoringInput } from './handle-scoring-job';
import { BUILTIN_SCORER_DEFS, prepareScoring, runSingleScorer } from './handle-scoring-job';

function assistantWithChunks(text: string, chunks: Record<string, unknown>[]) {
  return {
    parts: [
      { type: 'text', text },
      {
        type: 'tool-invocation',
        state: 'output-available',
        output: { _chunkSources: chunks },
      },
    ],
  };
}

function textContent(text: string) {
  return { parts: [{ type: 'text', text }] };
}

function createInput(overrides?: Partial<ScoringInput>): ScoringInput {
  return {
    messageId: 'msg-1',
    threadId: 'thread-1',
    agentId: 'supervisor',
    traceId: 'trace-1',
    ...overrides,
  };
}

function createDeps(overrides?: Partial<ScoringDeps>): ScoringDeps {
  return {
    fetchMessages: vi.fn().mockResolvedValue({
      assistantContent: assistantWithChunks('The answer is 42.', [
        { chunkId: 'c-1', displayIndex: 0, text: 'context chunk text' },
      ]),
      userContent: textContent('What is the answer?'),
      messageExternalId: 'msg-1',
    }),
    resolveLatestAssistantMessage: vi.fn().mockResolvedValue('msg-1'),
    hydrateChunks: vi.fn().mockResolvedValue(new Map()),
    hasExistingScore: vi.fn().mockResolvedValue(false),
    saveScore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const fakeModel = 'test-model' as never;

describe('prepareScoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue({ score: 0.85, reason: 'test reason' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 5 scorers when context is available', async () => {
    const deps = createDeps();
    const result = await prepareScoring(createInput(), deps, fakeModel);

    expect(result.scorersToRun.length).toBe(5);
    expect(result.skippedCount).toBe(0);
    expect(result.contextSkippedScorers).toHaveLength(0);
    expect(result.messageId).toBe('msg-1');
    expect(result.userQuestion).toBe('What is the answer?');
    expect(result.responseText).toBe('The answer is 42.');
    expect(result.context).toEqual(['context chunk text']);
  });

  it('throws unrecoverable error when message not found', async () => {
    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue(null),
    });

    await expect(prepareScoring(createInput(), deps, fakeModel)).rejects.toThrow('Message not found: msg-1');

    try {
      await prepareScoring(createInput(), deps, fakeModel);
    } catch (err) {
      expect((err as { unrecoverable: boolean }).unrecoverable).toBe(true);
    }
  });

  it('throws unrecoverable error when scoring data cannot be extracted', async () => {
    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        assistantContent: { parts: [] },
        userContent: textContent('Hello'),
      }),
    });

    await expect(prepareScoring(createInput(), deps, fakeModel)).rejects.toThrow(
      'Cannot extract scoring data from message: msg-1',
    );
  });

  it('skips scorers that already have scores (idempotency)', async () => {
    const deps = createDeps({
      hasExistingScore: vi.fn().mockImplementation((_entityId: string, scorerId: string) => {
        return scorerId === 'faithfulness' || scorerId === 'hallucination';
      }),
    });

    const result = await prepareScoring(createInput(), deps, fakeModel);

    expect(result.scorersToRun.length).toBe(3);
    expect(result.skippedCount).toBe(2);
  });

  it('hydrates chunks when text is missing', async () => {
    const hydrateChunks = vi.fn().mockResolvedValue(new Map([['c-1', 'hydrated chunk text']]));

    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        assistantContent: assistantWithChunks('Answer', [{ chunkId: 'c-1', displayIndex: 0 }]),
        userContent: textContent('Question'),
      }),
      hydrateChunks,
    });

    await prepareScoring(createInput(), deps, fakeModel);
    expect(hydrateChunks).toHaveBeenCalledWith(['c-1']);
  });

  it('returns response quality scorers when no chunks (direct answer)', async () => {
    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        assistantContent: textContent('Direct answer without chunks'),
        userContent: textContent('Simple question'),
      }),
    });

    const result = await prepareScoring(createInput(), deps, fakeModel);

    // answerRelevancy + faithfulness + hallucination run (response quality)
    expect(result.scorersToRun.length).toBe(3);
    const names = result.scorersToRun.map((s) => s.name);
    expect(names).toContain('answerRelevancy');
    expect(names).toContain('faithfulness');
    expect(names).toContain('hallucination');
    // contextRelevance + contextPrecision skipped (retrieval quality)
    expect(result.contextSkippedScorers.length).toBe(2);
    expect(deps.hydrateChunks).not.toHaveBeenCalled();
  });

  it('resolves messageId from thread when empty', async () => {
    const deps = createDeps();
    const result = await prepareScoring(createInput({ messageId: '' }), deps, fakeModel);

    expect(deps.resolveLatestAssistantMessage).toHaveBeenCalledWith('thread-1');
    expect(result.messageId).toBe('msg-1');
  });

  it('throws unrecoverable when no assistant message in thread', async () => {
    const deps = createDeps({
      resolveLatestAssistantMessage: vi.fn().mockResolvedValue(null),
    });

    await expect(prepareScoring(createInput({ messageId: '' }), deps, fakeModel)).rejects.toThrow(
      'No assistant message found in thread: thread-1',
    );
  });
});

describe('runSingleScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue({ score: 0.85, reason: 'test reason' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs scorer and returns result without persisting when no persist field', async () => {
    const deps = createDeps();
    const result = await runSingleScorer(
      {
        scorerDefinition: BUILTIN_SCORER_DEFS[0],
        userQuestion: 'What is the answer?',
        responseText: 'The answer is 42.',
        context: ['context chunk text'],
      },
      deps,
      fakeModel,
    );

    expect(result.scorerId).toBe('answerRelevancy');
    expect(result.score).toBe(0.85);
    expect(result.reason).toBe('test reason');
    expect(deps.saveScore).not.toHaveBeenCalled();
  });

  it('runs scorer and persists when persist field is set', async () => {
    const deps = createDeps();
    const result = await runSingleScorer(
      {
        scorerDefinition: BUILTIN_SCORER_DEFS[0],
        userQuestion: 'What is the answer?',
        responseText: 'The answer is 42.',
        context: ['context chunk text'],
        persist: {
          messageId: 'msg-1',
          threadId: 'thread-1',
          agentId: 'supervisor',
          traceId: 'trace-1',
        },
      },
      deps,
      fakeModel,
    );

    expect(result.scorerId).toBe('answerRelevancy');
    expect(result.score).toBe(0.85);
    expect(deps.saveScore).toHaveBeenCalledTimes(1);

    const savedScore = (deps.saveScore as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedScore).toMatchObject({
      scorerId: 'answerRelevancy',
      traceId: 'trace-1',
      score: 0.85,
      reason: 'test reason',
      entityType: 'message',
      entityId: 'msg-1',
      threadId: 'thread-1',
    });
  });

  it('skips if score already exists (idempotency on retry)', async () => {
    const deps = createDeps({
      hasExistingScore: vi.fn().mockResolvedValue(true),
    });

    const result = await runSingleScorer(
      {
        scorerDefinition: BUILTIN_SCORER_DEFS[0],
        userQuestion: 'What?',
        responseText: 'Answer',
        context: [],
        persist: { messageId: 'msg-1', threadId: 'thread-1', agentId: 'a', traceId: null },
      },
      deps,
      fakeModel,
    );

    expect(result.skipped).toBe(true);
    expect(mockRun).not.toHaveBeenCalled();
    expect(deps.saveScore).not.toHaveBeenCalled();
  });

  it('propagates scorer errors for BullMQ retry', async () => {
    mockRun.mockRejectedValueOnce(new Error('LLM rate limit'));
    const deps = createDeps();

    await expect(
      runSingleScorer(
        {
          scorerDefinition: BUILTIN_SCORER_DEFS[0],
          userQuestion: 'What?',
          responseText: 'Answer',
          context: [],
        },
        deps,
        fakeModel,
      ),
    ).rejects.toThrow('LLM rate limit');
  });

  it('handles null traceId', async () => {
    const deps = createDeps();
    await runSingleScorer(
      {
        scorerDefinition: BUILTIN_SCORER_DEFS[0],
        userQuestion: 'What?',
        responseText: 'Answer',
        context: [],
        persist: { messageId: 'msg-1', threadId: 'thread-1', agentId: 'a', traceId: null },
      },
      deps,
      fakeModel,
    );

    const savedScore = (deps.saveScore as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(savedScore.traceId).toBeUndefined();
  });
});

describe('BUILTIN_SCORER_DEFS', () => {
  it('contains 5 prebuilt scorer definitions', () => {
    expect(BUILTIN_SCORER_DEFS).toHaveLength(5);
    expect(BUILTIN_SCORER_DEFS.map((d) => d.name)).toEqual([
      'answerRelevancy',
      'faithfulness',
      'hallucination',
      'contextRelevance',
      'contextPrecision',
    ]);
  });
});
