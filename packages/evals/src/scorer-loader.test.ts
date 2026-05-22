import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------- Hoisted mocks ----------
const { mockFactories } = vi.hoisted(() => ({
  mockFactories: {
    createFaithfulnessScorer: vi.fn(() => ({ type: 'faithfulness' })),
    createHallucinationScorer: vi.fn(() => ({ type: 'hallucination' })),
    createAnswerRelevancyScorer: vi.fn(() => ({ type: 'answerRelevancy' })),
    createContextRelevanceScorerLLM: vi.fn(() => ({ type: 'contextRelevance' })),
    createContextPrecisionScorer: vi.fn(() => ({ type: 'contextPrecision' })),
  },
}));

// ---------- Module mocks ----------
vi.mock('@mastra/evals/scorers/prebuilt', () => mockFactories);

import type { ScorerDefinitionVersion } from './scorer-loader';
import { constructScorer, mapScorerRows } from './scorer-loader';

// ---------- Helpers ----------
function makeDefinition(overrides: Partial<ScorerDefinitionVersion> = {}): ScorerDefinitionVersion {
  return {
    id: 'scorer-1',
    name: 'test-scorer',
    type: 'faithfulness',
    description: 'A test scorer',
    model: null,
    instructions: null,
    scoreRange: null,
    presetConfig: null,
    defaultSampling: null,
    ...overrides,
  };
}

const mockModelInstance = { provider: 'openai', name: 'gpt-4' } as never;
const mockModel = () => mockModelInstance;

// ---------- Tests ----------
describe('constructScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('context-dependent types', () => {
    // Only retrieval scorers are blocked with empty context
    for (const type of ['contextRelevance', 'contextPrecision']) {
      it(`returns null for "${type}" when context is empty`, () => {
        const result = constructScorer(makeDefinition({ type }), mockModel, []);
        expect(result).toBeNull();
      });
    }

    // Response quality scorers work with empty context
    for (const type of ['faithfulness', 'hallucination']) {
      it(`returns scorer for "${type}" even when context is empty`, () => {
        const result = constructScorer(makeDefinition({ type }), mockModel, []);
        expect(result).not.toBeNull();
      });
    }

    it('returns scorer for context-dependent type when context is non-empty', () => {
      const result = constructScorer(makeDefinition({ type: 'faithfulness' }), mockModel, ['some context']);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-scorer');
    });
  });

  describe('prebuilt types', () => {
    it('creates faithfulness scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'faithfulness', name: 'faith' }), mockModel, context);
      expect(mockFactories.createFaithfulnessScorer).toHaveBeenCalledWith({
        model: mockModelInstance,
        options: { context },
      });
    });

    it('creates hallucination scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'hallucination', name: 'halluc' }), mockModel, context);
      expect(mockFactories.createHallucinationScorer).toHaveBeenCalledWith({
        model: mockModelInstance,
        options: { context },
      });
    });

    it('creates answerRelevancy scorer with model only', () => {
      constructScorer(makeDefinition({ type: 'answerRelevancy', name: 'ar' }), mockModel, []);
      expect(mockFactories.createAnswerRelevancyScorer).toHaveBeenCalledWith({ model: mockModelInstance });
    });

    it('creates contextRelevance scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'contextRelevance', name: 'cr' }), mockModel, context);
      expect(mockFactories.createContextRelevanceScorerLLM).toHaveBeenCalledWith({
        model: mockModelInstance,
        options: { context },
      });
    });

    it('creates contextPrecision scorer with model and context', () => {
      const context = ['doc content'];
      constructScorer(makeDefinition({ type: 'contextPrecision', name: 'cp' }), mockModel, context);
      expect(mockFactories.createContextPrecisionScorer).toHaveBeenCalledWith({
        model: mockModelInstance,
        options: { context },
      });
    });

    it('uses definition.name as the scorer id', () => {
      const result = constructScorer(makeDefinition({ type: 'answerRelevancy', name: 'my-scorer' }), mockModel, []);
      expect(result?.id).toBe('my-scorer');
    });
  });

  describe('custom type', () => {
    it('creates custom scorer with instructions', () => {
      const def = makeDefinition({ type: 'custom', name: 'tone-check', instructions: 'Check tone' });
      const result = constructScorer(def, mockModel, []);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('tone-check');
      expect(result?.scorer).toBeDefined();
    });

    it('returns null when custom type has no instructions', () => {
      const def = makeDefinition({ type: 'custom', name: 'no-instr', instructions: null });
      const result = constructScorer(def, mockModel, []);
      expect(result).toBeNull();
    });
  });

  describe('pinned model', () => {
    it('calls factory with pinned model ID when definition.model is set', () => {
      const factory = vi.fn().mockReturnValue(mockModelInstance);
      const def = makeDefinition({
        type: 'faithfulness',
        name: 'pinned',
        model: { id: 'anthropic/claude-sonnet-4-6' },
      });
      constructScorer(def, factory, ['ctx']);
      expect(factory).toHaveBeenCalledWith('anthropic/claude-sonnet-4-6');
    });

    it('calls factory with undefined when definition.model is null', () => {
      const factory = vi.fn().mockReturnValue(mockModelInstance);
      const def = makeDefinition({ type: 'faithfulness', name: 'default' });
      constructScorer(def, factory, ['ctx']);
      expect(factory).toHaveBeenCalledWith(undefined);
    });
  });

  describe('unknown type', () => {
    it('returns null for unknown scorer type', () => {
      const result = constructScorer(makeDefinition({ type: 'nonexistent' }), mockModel, ['ctx']);
      expect(result).toBeNull();
    });
  });
});

describe('mapScorerRows', () => {
  it('maps raw SQL rows to ScorerDefinitionVersion objects', () => {
    const rows = [
      {
        id: 's-1',
        name: 'faith',
        type: 'faithfulness',
        description: 'Checks faithfulness',
        model: { provider: 'openai' },
        instructions: 'Be faithful',
        score_range: { min: 0, max: 1 },
        preset_config: { key: 'value' },
        default_sampling: { strategy: 'random' },
      },
    ];

    const result = mapScorerRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 's-1',
      name: 'faith',
      type: 'faithfulness',
      description: 'Checks faithfulness',
      model: { provider: 'openai' },
      instructions: 'Be faithful',
      scoreRange: { min: 0, max: 1 },
      presetConfig: { key: 'value' },
      defaultSampling: { strategy: 'random' },
    });
  });

  it('defaults nullable fields to null', () => {
    const rows = [{ id: 's-2', name: 'minimal', type: 'custom' }];
    const result = mapScorerRows(rows);
    expect(result[0].description).toBeNull();
    expect(result[0].model).toBeNull();
    expect(result[0].instructions).toBeNull();
    expect(result[0].scoreRange).toBeNull();
    expect(result[0].presetConfig).toBeNull();
    expect(result[0].defaultSampling).toBeNull();
  });

  it('handles empty array', () => {
    expect(mapScorerRows([])).toEqual([]);
  });
});
