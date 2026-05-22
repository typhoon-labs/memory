import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mastra/core/evals', () => ({
  runEvals: vi.fn(),
}));

vi.mock('./scorers', () => ({
  createRagScorers: vi.fn(),
}));

import { runEvals } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';

import { runRagEvals } from './run';
import { createRagScorers } from './scorers';

const mockRunEvals = vi.mocked(runEvals);
const mockCreateRagScorers = vi.mocked(createRagScorers);

beforeEach(() => vi.clearAllMocks());

describe('runRagEvals', () => {
  const mockAgent = { name: 'test-agent' } as Parameters<typeof runRagEvals>[0];
  const mockModel = { provider: 'test' } as unknown as MastraModelConfig;

  const fakeScorerObj = {
    faithfulness: { name: 'faithfulness' },
    hallucination: { name: 'hallucination' },
    answerRelevancy: { name: 'answerRelevancy' },
    contextRelevance: { name: 'contextRelevance' },
    contextPrecision: { name: 'contextPrecision' },
  };

  it('creates scorers with the provided model', async () => {
    mockCreateRagScorers.mockReturnValue(fakeScorerObj as ReturnType<typeof createRagScorers>);
    mockRunEvals.mockResolvedValue({
      scores: {},
      summary: { totalItems: 1 },
    } as Awaited<ReturnType<typeof runEvals>>);

    await runRagEvals(mockAgent, mockModel, [{ input: 'What is PTO?' }]);

    expect(mockCreateRagScorers).toHaveBeenCalledWith(mockModel);
  });

  it('passes all scorers and data to runEvals', async () => {
    mockCreateRagScorers.mockReturnValue(fakeScorerObj as ReturnType<typeof createRagScorers>);
    mockRunEvals.mockResolvedValue({
      scores: {},
      summary: { totalItems: 2 },
    } as Awaited<ReturnType<typeof runEvals>>);

    const data = [{ input: 'Q1' }, { input: 'Q2' }];
    await runRagEvals(mockAgent, mockModel, data);

    expect(mockRunEvals).toHaveBeenCalledWith(
      expect.objectContaining({
        data,
        scorers: Object.values(fakeScorerObj),
        target: mockAgent,
      }),
    );
  });

  it('collects results via onItemComplete callback', async () => {
    mockCreateRagScorers.mockReturnValue(fakeScorerObj as ReturnType<typeof createRagScorers>);

    mockRunEvals.mockImplementation(async (opts) => {
      // Simulate the callback being called for each data item
      const onItemComplete = (opts as Record<string, unknown>).onItemComplete as (args: {
        item: { input: string };
        scorerResults: Record<string, { score: number; reason?: string }>;
      }) => void;

      onItemComplete({
        item: { input: 'Q1' },
        scorerResults: {
          faithfulness: { score: 0.9, reason: 'Good' },
          hallucination: { score: 0.1 },
        },
      });

      onItemComplete({
        item: { input: 'Q2' },
        scorerResults: {
          faithfulness: { score: 0.7, reason: 'OK' },
        },
      });

      return { scores: {}, summary: { totalItems: 2 } } as Awaited<ReturnType<typeof runEvals>>;
    });

    const { results, summary } = await runRagEvals(mockAgent, mockModel, [{ input: 'Q1' }, { input: 'Q2' }]);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      input: 'Q1',
      scores: {
        faithfulness: { score: 0.9, reason: 'Good' },
        hallucination: { score: 0.1, reason: undefined },
      },
    });
    expect(results[1]).toEqual({
      input: 'Q2',
      scores: {
        faithfulness: { score: 0.7, reason: 'OK' },
      },
    });
    expect(summary).toEqual({ totalItems: 2 });
  });

  it('returns empty results when no data is provided', async () => {
    mockCreateRagScorers.mockReturnValue(fakeScorerObj as ReturnType<typeof createRagScorers>);
    mockRunEvals.mockResolvedValue({
      scores: {},
      summary: { totalItems: 0 },
    } as Awaited<ReturnType<typeof runEvals>>);

    const { results, summary } = await runRagEvals(mockAgent, mockModel, []);

    expect(results).toEqual([]);
    expect(summary).toBeDefined();
  });

  it('returns the summary from runEvals', async () => {
    mockCreateRagScorers.mockReturnValue(fakeScorerObj as ReturnType<typeof createRagScorers>);
    const expectedSummary = { totalItems: 1 };
    mockRunEvals.mockResolvedValue({
      scores: {},
      summary: expectedSummary,
    } as Awaited<ReturnType<typeof runEvals>>);

    const { summary } = await runRagEvals(mockAgent, mockModel, [{ input: 'test' }]);

    expect(summary).toEqual(expectedSummary);
  });
});
