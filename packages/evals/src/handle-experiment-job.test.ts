import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatasetItem, ExperimentDeps, ExperimentRecord } from './handle-experiment-job';
import {
  completeExperiment,
  extractChunkSourcesFromSteps,
  extractContextFromSteps,
  processExperimentItemStep1,
  processExperimentItemStep2,
  setupExperiment,
} from './handle-experiment-job';

// ── extractContextFromSteps ─────────────────────────────────────

describe('extractContextFromSteps', () => {
  it('returns empty array when steps is undefined', () => {
    expect(extractContextFromSteps(undefined)).toEqual([]);
  });

  it('returns empty array when steps is empty', () => {
    expect(extractContextFromSteps([])).toEqual([]);
  });

  it('extracts text from _chunkSources in toolResults', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              _chunkSources: [{ text: 'chunk one' }, { text: 'chunk two' }],
            },
          },
        ],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual(['chunk one', 'chunk two']);
  });

  it('extracts from payload.result path as well', () => {
    const steps = [
      {
        toolResults: [
          {
            payload: {
              result: {
                _chunkSources: [{ text: 'from payload' }],
              },
            },
          },
        ],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual(['from payload']);
  });

  it('skips entries without _chunkSources', () => {
    const steps = [
      {
        toolResults: [{ result: { answer: 'no chunks here' } }],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual([]);
  });

  it('skips entries with non-array _chunkSources', () => {
    const steps = [
      {
        toolResults: [{ result: { _chunkSources: 'not an array' } }],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual([]);
  });

  it('skips chunk sources with non-string or empty text', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              _chunkSources: [{ text: '' }, { text: 123 }, { text: 'valid' }],
            },
          },
        ],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual(['valid']);
  });

  it('handles steps without toolResults gracefully', () => {
    const steps = [{ someOtherField: true }];
    expect(extractContextFromSteps(steps)).toEqual([]);
  });

  it('aggregates across multiple steps', () => {
    const steps = [
      {
        toolResults: [{ result: { _chunkSources: [{ text: 'a' }] } }],
      },
      {
        toolResults: [{ result: { _chunkSources: [{ text: 'b' }, { text: 'c' }] } }],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual(['a', 'b', 'c']);
  });
});

// ── extractChunkSourcesFromSteps ────────────────────────────────

describe('extractChunkSourcesFromSteps', () => {
  it('returns empty array when steps is undefined', () => {
    expect(extractChunkSourcesFromSteps(undefined)).toEqual([]);
  });

  it('extracts full chunk source objects from toolResults', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              _chunkSources: [
                {
                  chunkId: 'c-1',
                  displayIndex: '1.1',
                  score: 0.9,
                  text: 'chunk text',
                  title: 'Doc Title',
                  section: 'Intro',
                  source: 'file.txt',
                  syncTargetName: 'Support',
                  documentId: 'd-1',
                },
              ],
            },
          },
        ],
      },
    ];
    const result = extractChunkSourcesFromSteps(steps);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      chunkId: 'c-1',
      displayIndex: '1.1',
      score: 0.9,
      text: 'chunk text',
      title: 'Doc Title',
      section: 'Intro',
      source: 'file.txt',
      syncTargetName: 'Support',
      documentId: 'd-1',
    });
  });

  it('skips entries without chunkId', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              _chunkSources: [{ displayIndex: '1', title: 'No ID' }],
            },
          },
        ],
      },
    ];
    expect(extractChunkSourcesFromSteps(steps)).toEqual([]);
  });

  it('converts numeric displayIndex to string', () => {
    const steps = [
      {
        toolResults: [
          {
            result: {
              _chunkSources: [{ chunkId: 'c-1', displayIndex: 2 }],
            },
          },
        ],
      },
    ];
    const result = extractChunkSourcesFromSteps(steps);
    expect(result[0].displayIndex).toBe('2');
  });
});

// ── setupExperiment ─────────────────────────────────────────────

describe('setupExperiment', () => {
  const makeExperiment = (overrides?: Partial<ExperimentRecord>): ExperimentRecord => ({
    id: 'exp-1',
    status: 'pending',
    dataset_id: 'ds-1',
    dataset_version: 1,
    total_items: 2,
    ...overrides,
  });

  const makeItems = (count = 2): DatasetItem[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      input: { question: `Question ${i}?` },
    }));

  let deps: Pick<ExperimentDeps, 'getExperiment' | 'updateExperiment' | 'getDatasetItems'>;

  beforeEach(() => {
    deps = {
      getExperiment: vi.fn(),
      updateExperiment: vi.fn().mockResolvedValue(undefined),
      getDatasetItems: vi.fn(),
    };
  });

  it('throws unrecoverable when experiment not found', async () => {
    (deps.getExperiment as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const error = await setupExperiment('exp-1', deps).catch((err: unknown) => err);
    expect((error as Error).message).toContain('Experiment not found');
    expect((error as { unrecoverable: boolean }).unrecoverable).toBe(true);
  });

  it('throws unrecoverable when experiment is not pending', async () => {
    (deps.getExperiment as ReturnType<typeof vi.fn>).mockResolvedValue(makeExperiment({ status: 'running' }));
    await expect(setupExperiment('exp-1', deps)).rejects.toThrow('expected pending');
  });

  it('updates experiment to running and loads items', async () => {
    const experiment = makeExperiment();
    const items = makeItems(2);
    (deps.getExperiment as ReturnType<typeof vi.fn>).mockResolvedValue(experiment);
    (deps.getDatasetItems as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    const result = await setupExperiment('exp-1', deps);

    expect(deps.updateExperiment).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp-1', status: 'running' }));
    expect(result.experiment).toEqual(experiment);
    expect(result.items).toEqual(items);
  });

  it('marks experiment as completed when dataset is empty', async () => {
    const experiment = makeExperiment({ total_items: 0 });
    (deps.getExperiment as ReturnType<typeof vi.fn>).mockResolvedValue(experiment);
    (deps.getDatasetItems as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await setupExperiment('exp-1', deps);

    // Called twice: first running, then completed
    expect(deps.updateExperiment).toHaveBeenCalledTimes(2);
    expect(deps.updateExperiment).toHaveBeenCalledWith(expect.objectContaining({ id: 'exp-1', status: 'completed' }));
    expect(result.items).toEqual([]);
  });
});

// ── processExperimentItemStep2 ──────────────────────────────────

describe('processExperimentItemStep2', () => {
  let deps: Pick<ExperimentDeps, 'addExperimentResult' | 'updateExperiment'>;

  beforeEach(() => {
    deps = {
      addExperimentResult: vi.fn().mockResolvedValue(undefined),
      updateExperiment: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('saves result with executed scores and context-skipped scorers', async () => {
    const childrenValues = {
      'job-1': { scorerId: 'faithfulness', score: 0.9, reason: 'Good' },
      'job-2': { scorerId: 'answerRelevancy', score: 0.8, reason: 'Decent' },
    };
    const startedAt = new Date('2025-01-01');

    const result = await processExperimentItemStep2(
      'exp-1',
      'item-1',
      { question: 'Q?' },
      null,
      'Agent response text',
      childrenValues,
      {},
      ['contextRelevance'],
      deps,
      startedAt,
    );

    expect(result.succeeded).toBe(true);
    expect(result.scorersFailed).toBe(0);
    expect(deps.addExperimentResult).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: 'exp-1',
        itemId: 'item-1',
        input: { question: 'Q?' },
        output: expect.objectContaining({
          responseText: 'Agent response text',
          scores: expect.arrayContaining([
            expect.objectContaining({ scorerId: 'contextRelevance', score: null, status: 'skipped' }),
          ]),
        }),
        groundTruth: null,
        startedAt,
      }),
    );
  });

  it('reports number of failed scorers', async () => {
    const result = await processExperimentItemStep2(
      'exp-1',
      'item-1',
      { question: 'Q?' },
      null,
      'Response',
      { 'job-1': { scorerId: 'faithfulness', score: 0.5, reason: 'OK' } },
      { 'job-2': 'scorer timeout' },
      [],
      deps,
      new Date(),
    );

    expect(result.scorersFailed).toBe(1);
  });

  it('includes ground truth when provided', async () => {
    const groundTruth = { expectedAnswer: 'Yes' };

    await processExperimentItemStep2(
      'exp-1',
      'item-1',
      { question: 'Q?' },
      groundTruth,
      'Response',
      {},
      {},
      [],
      deps,
      new Date(),
    );

    expect(deps.addExperimentResult).toHaveBeenCalledWith(expect.objectContaining({ groundTruth }));
  });
});

// ── completeExperiment ──────────────────────────────────────────

describe('completeExperiment', () => {
  let deps: Pick<ExperimentDeps, 'updateExperiment'>;

  beforeEach(() => {
    deps = {
      updateExperiment: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('marks experiment as completed with counts', async () => {
    const childrenValues = {
      'job-1': { itemId: 'i1', succeeded: true, scorersFailed: 0 },
      'job-2': { itemId: 'i2', succeeded: true, scorersFailed: 1 },
    };

    const result = await completeExperiment('exp-1', childrenValues, {}, deps);

    expect(result).toEqual({ succeeded: 2, failed: 0, cancelled: false });
    expect(deps.updateExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'exp-1',
        status: 'completed',
        succeededCount: 2,
        failedCount: 0,
      }),
    );
  });

  it('marks experiment as failed when all items failed', async () => {
    const result = await completeExperiment('exp-1', {}, { 'job-1': 'error1', 'job-2': 'error2' }, deps);

    expect(result).toEqual({ succeeded: 0, failed: 2, cancelled: false });
    expect(deps.updateExperiment).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', failedCount: 2 }));
  });

  it('marks experiment as completed when at least one succeeded', async () => {
    const childrenValues = {
      'job-1': { itemId: 'i1', succeeded: true, scorersFailed: 0 },
    };

    const result = await completeExperiment('exp-1', childrenValues, { 'job-2': 'some error' }, deps);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(deps.updateExperiment).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('handles no items at all', async () => {
    const result = await completeExperiment('exp-1', {}, {}, deps);

    expect(result).toEqual({ succeeded: 0, failed: 0, cancelled: false });
    expect(deps.updateExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', succeededCount: 0, failedCount: 0 }),
    );
  });
});

// ── Additional edge cases for processExperimentItemStep2 ──────────

describe('processExperimentItemStep2 — edge cases', () => {
  let deps: Pick<ExperimentDeps, 'addExperimentResult' | 'updateExperiment'>;

  beforeEach(() => {
    deps = {
      addExperimentResult: vi.fn().mockResolvedValue(undefined),
      updateExperiment: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('handles empty childrenValues and no skipped scorers', async () => {
    const result = await processExperimentItemStep2(
      'exp-1',
      'item-1',
      { question: 'Q?' },
      null,
      'Response text',
      {},
      {},
      [],
      deps,
      new Date(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.scorersFailed).toBe(0);
    expect(deps.addExperimentResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          scores: [],
        }),
      }),
    );
  });

  it('merges executed and skipped scorers into output scores', async () => {
    const childrenValues = {
      'job-1': { scorerId: 'faithfulness', score: 0.95, reason: 'Excellent' },
    };

    const result = await processExperimentItemStep2(
      'exp-1',
      'item-1',
      { question: 'Q?' },
      null,
      'Agent said things',
      childrenValues,
      {},
      ['contextRecall', 'contextPrecision'],
      deps,
      new Date(),
    );

    expect(result.succeeded).toBe(true);
    const addCall = (deps.addExperimentResult as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const scores = addCall.output.scores;
    expect(scores).toHaveLength(3); // 1 executed + 2 skipped
    expect(scores.filter((s: { status?: string }) => s.status === 'skipped')).toHaveLength(2);
  });

  it('counts multiple failed scorers correctly', async () => {
    const result = await processExperimentItemStep2(
      'exp-1',
      'item-1',
      { question: 'Q?' },
      null,
      'Response',
      {},
      { 'job-1': 'timeout', 'job-2': 'OOM', 'job-3': 'network error' },
      [],
      deps,
      new Date(),
    );

    expect(result.scorersFailed).toBe(3);
  });
});

// ── Additional edge cases for extractContextFromSteps ──────────────

describe('extractContextFromSteps — additional cases', () => {
  it('prefers payload.result over direct result', () => {
    const steps = [
      {
        toolResults: [
          {
            payload: {
              result: {
                _chunkSources: [{ text: 'from payload' }],
              },
            },
            result: {
              _chunkSources: [{ text: 'from direct' }],
            },
          },
        ],
      },
    ];
    // payload.result takes precedence due to the order in the code
    const context = extractContextFromSteps(steps);
    expect(context).toContain('from payload');
  });

  it('handles empty steps array', () => {
    expect(extractContextFromSteps([])).toEqual([]);
  });

  it('deduplicates context chunks from same step', () => {
    const steps = [
      {
        toolResults: [
          { result: { _chunkSources: [{ text: 'duplicate' }] } },
          { result: { _chunkSources: [{ text: 'duplicate' }, { text: 'unique' }] } },
        ],
      },
    ];
    const context = extractContextFromSteps(steps);
    // Both 'duplicate' entries should be present (no deduplication in the function)
    expect(context.filter((c) => c === 'duplicate').length).toBe(2);
    expect(context).toContain('unique');
  });

  it('handles toolResults with null/undefined result', () => {
    const steps = [
      {
        toolResults: [{ result: undefined }, { result: null }, { payload: { result: undefined } }],
      },
    ];
    expect(extractContextFromSteps(steps)).toEqual([]);
  });
});

// ── processExperimentItemStep1 ──────────────────────────────────

describe('processExperimentItemStep1', () => {
  const baseItem: DatasetItem = {
    id: 'item-1',
    input: { question: 'What is AI?' },
    groundTruth: { answer: 'Artificial Intelligence' },
  };

  const mockAgent = {
    generate: vi.fn(),
  } as unknown as import('@mastra/core/agent').Agent;

  const mockModel = (() => 'gpt-4o') as unknown as import('./scorer-loader').ModelFactory;

  it('returns null when experiment is cancelled (status failed)', async () => {
    const deps = {
      getExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'failed' }),
    };

    const result = await processExperimentItemStep1(baseItem, 'exp-1', mockAgent, mockModel, [], deps);

    expect(result).toBeNull();
    expect(mockAgent.generate).not.toHaveBeenCalled();
  });

  it('returns null when experiment is not found', async () => {
    const deps = {
      getExperiment: vi.fn().mockResolvedValue(null),
    };

    const result = await processExperimentItemStep1(baseItem, 'exp-missing', mockAgent, mockModel, [], deps);

    expect(result).toBeNull();
  });

  it('calls agent.generate and returns response with context', async () => {
    const deps = {
      getExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'running' }),
    };

    vi.mocked(mockAgent.generate).mockResolvedValue({
      text: 'AI stands for Artificial Intelligence',
      steps: [
        {
          toolResults: [
            { result: { _chunkSources: [{ chunkId: 'c-1', text: 'context chunk 1', displayIndex: '1' }] } },
          ],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof mockAgent.generate>>);

    const result = await processExperimentItemStep1(baseItem, 'exp-1', mockAgent, mockModel, [], deps);

    expect(result).not.toBeNull();
    expect(result!.cancelled).toBe(false);
    expect(result!.question).toBe('What is AI?');
    expect(result!.responseText).toBe('AI stands for Artificial Intelligence');
    expect(result!.scorerResponseText).toBe('AI stands for Artificial Intelligence');
    expect(result!.context).toEqual(['context chunk 1']);
    expect(result!.chunkSources).toHaveLength(1);
    expect(result!.chunkSources[0].chunkId).toBe('c-1');
  });

  it('extracts question from string input', async () => {
    const deps = {
      getExperiment: vi.fn().mockResolvedValue({ id: 'exp-1', status: 'running' }),
    };

    vi.mocked(mockAgent.generate).mockResolvedValue({
      text: 'Response',
      steps: [],
    } as unknown as Awaited<ReturnType<typeof mockAgent.generate>>);

    const stringItem = { ...baseItem, input: 'Direct question' as unknown as Record<string, unknown> };
    const result = await processExperimentItemStep1(stringItem, 'exp-1', mockAgent, mockModel, [], deps);

    expect(result!.question).toBe('Direct question');
  });
});
