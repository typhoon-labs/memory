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
import { scoreMessage } from './handle-scoring-job';

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

describe('scoreMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue({ score: 0.85, reason: 'test reason' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all 5 scorers and saves 5 scores', async () => {
    const deps = createDeps();
    const result = await scoreMessage(createInput(), deps, fakeModel);

    expect(result.scored).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    expect(deps.saveScore).toHaveBeenCalledTimes(5);
  });

  it('throws unrecoverable error when message not found', async () => {
    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue(null),
    });

    await expect(scoreMessage(createInput(), deps, fakeModel)).rejects.toThrow('Message not found: msg-1');

    try {
      await scoreMessage(createInput(), deps, fakeModel);
    } catch (err) {
      expect((err as { unrecoverable: boolean }).unrecoverable).toBe(true);
    }
  });

  it('throws unrecoverable error when scoring data cannot be extracted', async () => {
    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        assistantContent: { parts: [] }, // no text
        userContent: textContent('Hello'),
      }),
    });

    await expect(scoreMessage(createInput(), deps, fakeModel)).rejects.toThrow(
      'Cannot extract scoring data from message: msg-1',
    );
  });

  it('skips scorers that already have scores (idempotency)', async () => {
    let callCount = 0;
    const deps = createDeps({
      hasExistingScore: vi.fn().mockImplementation((_entityId: string, scorerId: string) => {
        callCount++;
        // First two scorers already have scores
        return scorerId === 'faithfulness' || scorerId === 'hallucination';
      }),
    });

    const result = await scoreMessage(createInput(), deps, fakeModel);

    expect(result.scored).toBe(3);
    expect(result.skipped).toBe(2);
    expect(deps.saveScore).toHaveBeenCalledTimes(3);
  });

  it('re-throws on scorer failure (for BullMQ retry)', async () => {
    let runCallCount = 0;
    mockRun.mockImplementation(() => {
      runCallCount++;
      if (runCallCount === 3) throw new Error('LLM rate limit');
      return { score: 0.9, reason: 'ok' };
    });

    const deps = createDeps();

    await expect(scoreMessage(createInput(), deps, fakeModel)).rejects.toThrow('LLM rate limit');
    // First 2 scores were saved before failure
    expect(deps.saveScore).toHaveBeenCalledTimes(2);
  });

  it('hydrates chunks when text is missing', async () => {
    const hydrateChunks = vi.fn().mockResolvedValue(new Map([['c-1', 'hydrated chunk text']]));

    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        assistantContent: assistantWithChunks('Answer', [
          { chunkId: 'c-1', displayIndex: 0 }, // no text — needs hydration
        ]),
        userContent: textContent('Question'),
      }),
      hydrateChunks,
    });

    await scoreMessage(createInput(), deps, fakeModel);

    expect(hydrateChunks).toHaveBeenCalledWith(['c-1']);
  });

  it('works with no chunks (direct answer)', async () => {
    const deps = createDeps({
      fetchMessages: vi.fn().mockResolvedValue({
        assistantContent: textContent('Direct answer without chunks'),
        userContent: textContent('Simple question'),
      }),
    });

    const result = await scoreMessage(createInput(), deps, fakeModel);

    // Only answerRelevancy runs when there are no chunks
    expect(result.scored).toBe(1);
    expect(deps.hydrateChunks).not.toHaveBeenCalled();
  });

  it('saves score with correct fields', async () => {
    const deps = createDeps();
    await scoreMessage(createInput(), deps, fakeModel);

    const firstCall = (deps.saveScore as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall).toMatchObject({
      scorerId: 'answerRelevancy',
      traceId: 'trace-1',
      score: 0.85,
      reason: 'test reason',
      entityType: 'message',
      entityId: 'msg-1',
      threadId: 'thread-1',
    });
    expect(firstCall.id).toBeDefined();
  });

  it('handles null traceId', async () => {
    const deps = createDeps();
    await scoreMessage(createInput({ traceId: null }), deps, fakeModel);

    const firstCall = (deps.saveScore as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstCall.traceId).toBeUndefined();
  });

  it('resolves messageId from thread when empty', async () => {
    const deps = createDeps();
    await scoreMessage(createInput({ messageId: '' }), deps, fakeModel);

    expect(deps.resolveLatestAssistantMessage).toHaveBeenCalledWith('thread-1');
    expect(deps.fetchMessages).toHaveBeenCalledWith('msg-1');
    expect(deps.saveScore).toHaveBeenCalledTimes(5);
  });

  it('throws unrecoverable when no assistant message in thread', async () => {
    const deps = createDeps({
      resolveLatestAssistantMessage: vi.fn().mockResolvedValue(null),
    });

    await expect(scoreMessage(createInput({ messageId: '' }), deps, fakeModel)).rejects.toThrow(
      'No assistant message found in thread: thread-1',
    );
  });
});
